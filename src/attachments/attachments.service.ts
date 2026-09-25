import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CoursesService } from '../courses/courses.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private coursesService: CoursesService,
  ) {}

  async create(file: Express.Multer.File, dto: CreateAttachmentDto, instructorId: string, role: Role) {
    await this.verifyLectureOwnership(dto.lectureId, instructorId, role);

    const fileUrl = await this.storage.uploadFile(file, 'attachments');
    
    return this.prisma.attachment.create({
      data: {
        title: dto.title || file.originalname,
        lectureId: dto.lectureId,
        fileUrl: fileUrl,
        type: dto.type || 'OTHER',
      },
    });
  }

  async findAllByLecture(lectureId: string) {
    return this.prisma.attachment.findMany({
      where: { lectureId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async hasFileAccess(studentId: string, attachmentId: string): Promise<boolean> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId, deletedAt: null },
      include: { lecture: true },
    });
    if (!attachment || !attachment.lecture || !attachment.lecture.courseId) return false;

    // Must be eligible for the course
    const eligibleCourses = await this.coursesService.getCoursesForStudent(studentId);
    if (!eligibleCourses.some(c => c.id === attachment.lecture.courseId)) {
      return false;
    }

    const lectureAccess = await this.prisma.studentLectureAccess.findFirst({
      where: { studentId, lectureId: attachment.lectureId },
    });
    if (lectureAccess) return true;

    const courseAccess = await this.prisma.studentCourseAccess.findFirst({
      where: { studentId, courseId: attachment.lecture.courseId },
    });
    if (courseAccess) return true;

    const fileAccess = await this.prisma.studentFileAccess.findFirst({
      where: {
        studentId,
        OR: [
          { attachmentId },
          { courseId: attachment.lecture.courseId },
        ],
      },
    });
    if (fileAccess) return true;

    return false;
  }

  async getFilesForStudent(studentId: string, search?: string, courseId?: string, accessFilter?: string) {
    const eligibleCourses = await this.coursesService.getCoursesForStudent(studentId);
    const eligibleCourseIds = eligibleCourses.map(c => c.id);

    if (courseId && !eligibleCourseIds.includes(courseId)) {
      return [];
    }
    const filterCourseIds = courseId ? [courseId] : eligibleCourseIds;

    const attachments = await this.prisma.attachment.findMany({
      where: {
        lecture: {
          courseId: { in: filterCourseIds },
        },
        deletedAt: null,
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        lecture: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (attachments.length === 0) return [];

    const lectureIds = Array.from(new Set(attachments.map(a => a.lectureId)));
    
    const lectureAccesses = await this.prisma.studentLectureAccess.findMany({
      where: { studentId, lectureId: { in: lectureIds } },
    });
    const courseAccesses = await this.prisma.studentCourseAccess.findMany({
      where: { studentId, courseId: { in: filterCourseIds } },
    });
    const fileAccesses = await this.prisma.studentFileAccess.findMany({
      where: { studentId },
    });

    const result = attachments.map(attachment => {
      let accessStatus = 'LOCKED';
      let accessSource: string | null = null;
      
      const courseId = attachment.lecture?.course?.id;
      if (!courseId || !attachment.lecture) return null; // Skip attachments that somehow don't belong to a lecture or course

      const hasCourseAccess = courseAccesses.some(ca => ca.courseId === courseId);
      if (hasCourseAccess) {
        accessStatus = 'UNLOCKED';
        accessSource = 'COURSE';
      } else {
        const hasLectureAccess = lectureAccesses.some(la => la.lectureId === attachment.lecture.id);
        if (hasLectureAccess) {
          accessStatus = 'UNLOCKED';
          accessSource = 'LECTURE';
        } else {
          const hasCourseFiles = fileAccesses.some(fa => fa.courseId === courseId);
          if (hasCourseFiles) {
            accessStatus = 'UNLOCKED';
            accessSource = 'COURSE_FILES_CODE';
          } else {
            const hasFileAccess = fileAccesses.some(fa => fa.attachmentId === attachment.id);
            if (hasFileAccess) {
              accessStatus = 'UNLOCKED';
              accessSource = 'FILE_CODE';
            }
          }
        }
      }

      if (accessFilter === 'UNLOCKED' && accessStatus === 'LOCKED') return null;
      if (accessFilter === 'LOCKED' && accessStatus === 'UNLOCKED') return null;

      return {
        id: attachment.id,
        title: attachment.title,
        type: attachment.type,
        course: attachment.lecture.course,
        lecture: { id: attachment.lecture.id, title: attachment.lecture.title },
        accessStatus,
        accessSource,
      };
    }).filter(Boolean);

    return result;
  }

  async getStudentAttachmentViewUrl(studentId: string, attachmentId: string) {
    const hasAccess = await this.hasFileAccess(studentId, attachmentId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this file.');
    }

    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    return this.storage.generatePresignedGetUrl(attachment.fileUrl, 300);
  }

  async findById(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    return attachment;
  }

  async getInstructorAttachmentViewUrl(id: string) {
    const attachment = await this.findById(id);
    return this.storage.generatePresignedGetUrl(attachment.fileUrl, 300);
  }

  async delete(id: string, instructorId: string, role: Role) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.verifyCourseOwnership(attachment.lecture.courseId, instructorId, role);

    const fileUrl = attachment.fileUrl;
    if (fileUrl) {
      const bucketName = process.env.R2_BUCKET_NAME;
      const endpoint = process.env.R2_ENDPOINT;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const publicUrl = process.env.R2_PUBLIC_URL;

      if (bucketName && endpoint && accessKeyId && secretAccessKey) {
        const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint,
          credentials: { accessKeyId, secretAccessKey },
        });

        let key = fileUrl;
        if (publicUrl && fileUrl.startsWith(publicUrl)) {
          key = fileUrl.substring(publicUrl.length + 1);
        } else if (fileUrl.startsWith('https://')) {
          try {
            const urlObj = new URL(fileUrl);
            key = urlObj.pathname.substring(1);
          } catch (e) {}
        }

        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          }));
        } catch (error) {
          console.error('Failed to delete object from R2', error);
        }
      }
    }

    return this.prisma.attachment.delete({
      where: { id },
    });
  }

  private async verifyLectureOwnership(lectureId: string, instructorId: string, role: Role) {
    if (role === Role.ADMIN) return;

    const lecture = await this.prisma.lecture.findFirst({
      where: { id: lectureId, },
      select: { courseId: true },
    });
    if (!lecture || !lecture.courseId)
      throw new ForbiddenException('You do not have permission to modify attachments in this course.');

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId: lecture.courseId, instructorId, },
    });
    if (!mapping)
      throw new ForbiddenException('You do not have permission to modify attachments in this course.');
  }

  private async verifyCourseOwnership(courseId: string | null, instructorId: string, role: Role) {
    if (role === Role.ADMIN || !courseId) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });
    if (!mapping)
      throw new ForbiddenException('You do not have permission to delete this attachment.');
  }
}

