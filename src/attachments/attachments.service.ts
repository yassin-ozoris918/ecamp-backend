import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CoursesService } from '../courses/courses.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { Role } from '@prisma/client';
import { courseLevelAccessApplies, effectiveLectureAccess } from '../common/lecture-lock.policy';
import { filterUnreferencedUrls } from '../common/storage-refs';
import {
  cancelPendingNotificationsForTarget,
  enqueueLectureMaterialNotification,
} from '../notifications/content-notification-outbox';

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
    
    return this.prisma.$transaction(async (tx) => {
      // New files go to the end of the lecture's file list.
      const max = await tx.attachment.aggregate({ where: { lectureId: dto.lectureId }, _max: { orderIndex: true } });
      const attachment = await tx.attachment.create({
        data: {
          title: dto.title || file.originalname,
          lectureId: dto.lectureId,
          fileUrl: fileUrl,
          type: dto.type || 'OTHER',
          allowDownload: dto.allowDownload ?? null,
          orderIndex: (max._max.orderIndex ?? -1) + 1,
        },
      });
      await enqueueLectureMaterialNotification(tx, attachment.id);
      return attachment;
    });
  }

  /**
   * Effective download policy: the per-file override wins; when it is null the
   * course-level default applies. Anything unresolvable is treated as NOT allowed.
   */
  private resolveCanDownload(allowDownload: boolean | null | undefined, courseAllow: boolean | null | undefined): boolean {
    if (allowDownload === true) return true;
    if (allowDownload === false) return false;
    return courseAllow === true;
  }

  async updateDownloadPolicy(id: string, allowDownload: boolean | null, instructorId: string, role: Role) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    await this.verifyCourseOwnership(attachment.lecture.courseId, instructorId, role);

    return this.prisma.attachment.update({
      where: { id },
      data: { allowDownload },
    });
  }

  async findAllByLecture(lectureId: string) {
    const items = await this.prisma.attachment.findMany({
      where: { lectureId, deletedAt: null },
      include: { lecture: { select: { course: { select: { allowFileDownload: true } } } } },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map(({ lecture, ...att }) => ({
      ...att,
      courseAllowsDownload: lecture?.course?.allowFileDownload ?? true,
      canDownload: this.resolveCanDownload(att.allowDownload, lecture?.course?.allowFileDownload),
    }));
  }

  async hasFileAccess(studentId: string, attachmentId: string): Promise<boolean> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId, deletedAt: null },
      include: { lecture: { include: { course: true } } },
    });
    if (!attachment || !attachment.lecture || !attachment.lecture.courseId || !attachment.lecture.course) return false;

    // Must be eligible for the course (this checks targeting)
    const eligibleCourses = await this.coursesService.getCoursesForStudent(studentId, true);
    if (!eligibleCourses.some(c => c.id === attachment.lecture.courseId)) {
      return false;
    }

    const lectureAccess = effectiveLectureAccess(
      attachment.lecture,
      await this.prisma.studentLectureAccess.findFirst({
        where: { studentId, lectureId: attachment.lectureId },
      }),
    );
    if (lectureAccess) return true;

    // A locked lecture's files are sold with the lecture: full-course and course-files (materials)
    // codes do not open them. A single-file code bought for THIS exact file still does.
    if (!courseLevelAccessApplies(attachment.lecture)) {
      const ownFile = await this.prisma.studentFileAccess.findFirst({ where: { studentId, attachmentId } });
      return !!ownFile;
    }

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
    const eligibleCourses = await this.coursesService.getCoursesForStudent(studentId, true);
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
        lecture: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
            requiresOwnCode: true,
            chapter: { select: { id: true, title: true, orderIndex: true } },
            course: { select: { id: true, title: true, type: true, allowFileDownload: true } },
          },
        },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
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
      
      const courseType = attachment.lecture?.course?.type;
      const courseId = attachment.lecture?.course?.id;
      if (!courseId || !attachment.lecture) return null; // Skip attachments that somehow don't belong to a lecture or course

      const lectureRow = effectiveLectureAccess(
        attachment.lecture,
        lectureAccesses.find(la => la.lectureId === attachment.lecture.id),
      );
      const courseLevel = courseLevelAccessApplies(attachment.lecture);
      const hasCourseAccess = courseLevel && courseAccesses.some(ca => ca.courseId === courseId);
      if (hasCourseAccess) {
        accessStatus = 'UNLOCKED';
        accessSource = 'COURSE';
      } else {
        const hasLectureAccess = !!lectureRow;
        if (hasLectureAccess) {
          accessStatus = 'UNLOCKED';
          accessSource = 'LECTURE';
        } else {
          const courseFiles = courseLevel ? fileAccesses.find(fa => fa.courseId === courseId && !fa.attachmentId) : undefined;
          if (courseFiles) {
            accessStatus = 'UNLOCKED';
            accessSource = courseFiles.source === 'ADMIN_GRANT' ? 'ADMIN_GRANT' : 'COURSE_FILES_CODE';
          } else {
            const ownFile = fileAccesses.find(fa => fa.attachmentId === attachment.id);
            if (ownFile) {
              accessStatus = 'UNLOCKED';
              accessSource = ownFile.source === 'ADMIN_GRANT' ? 'ADMIN_GRANT' : 'FILE_CODE';
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
        course: { id: attachment.lecture.course.id, title: attachment.lecture.course.title, type: attachment.lecture.course.type },
        lecture: {
          id: attachment.lecture.id,
          title: attachment.lecture.title,
          orderIndex: attachment.lecture.orderIndex,
          // Sold separately: only its own lecture code (or a code for this file) opens it.
          locked: attachment.lecture.requiresOwnCode,
        },
        chapter: attachment.lecture.chapter
          ? { id: attachment.lecture.chapter.id, title: attachment.lecture.chapter.title, orderIndex: attachment.lecture.chapter.orderIndex }
          : null,
        createdAt: attachment.createdAt,
        accessStatus,
        accessSource,
        canDownload: this.resolveCanDownload(attachment.allowDownload, attachment.lecture.course.allowFileDownload),
      };
    }).filter(Boolean);

    return result;
  }

  async getStudentAttachmentViewUrl(studentId: string, attachmentId: string, forceDownload = false) {
    const hasAccess = await this.hasFileAccess(studentId, attachmentId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this file.');
    }

    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId, deletedAt: null },
      include: { lecture: { select: { course: { select: { allowFileDownload: true } } } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    const canDownload = this.resolveCanDownload(attachment.allowDownload, attachment.lecture?.course?.allowFileDownload);
    if (forceDownload && !canDownload) {
      throw new ForbiddenException('Downloading is disabled for this file. You can only view it online.');
    }

    // View-only files never get a direct/signed URL (a browser PDF viewer would expose Download/Print).
    // Students must use the proxied stream endpoint instead.
    if (!canDownload) return null;

    return this.storage.generatePresignedGetUrl(attachment.fileUrl, 300, forceDownload);
  }

  async getStudentAttachmentStream(studentId: string, attachmentId: string) {
    const hasAccess = await this.hasFileAccess(studentId, attachmentId);
    if (!hasAccess) throw new ForbiddenException('You do not have access to this file.');
    return this.openStream(attachmentId);
  }

  async getInstructorAttachmentStream(attachmentId: string) {
    return this.openStream(attachmentId);
  }

  private async openStream(attachmentId: string) {
    const attachment = await this.findById(attachmentId);
    const obj = await this.storage.getObjectForStreaming(attachment.fileUrl);
    return { ...obj, title: attachment.title };
  }

  async findById(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    return attachment;
  }

  async getInstructorAttachmentViewUrl(id: string, forceDownload = false) {
    const attachment = await this.findById(id);
    return this.storage.generatePresignedGetUrl(attachment.fileUrl, 300, forceDownload);
  }

  async delete(id: string, instructorId: string, role: Role) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.verifyCourseOwnership(attachment.lecture.courseId, instructorId, role);

    // Database first; the storage object is removed only if no other row (e.g. a copied lecture) uses it.
    const [deleted] = await this.prisma.$transaction([
      this.prisma.attachment.delete({ where: { id } }),
      cancelPendingNotificationsForTarget(this.prisma, id),
    ]);

    const [fileUrl] = await filterUnreferencedUrls(this.prisma, [attachment.fileUrl]);
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

    return deleted;
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

