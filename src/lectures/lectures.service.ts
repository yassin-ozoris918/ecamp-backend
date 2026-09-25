import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { Role } from '@prisma/client';
import { CloudflareService } from '../cloudflare/cloudflare.service';

@Injectable()
export class LecturesService {
  constructor(
    private prisma: PrismaService,
    private cloudflareService: CloudflareService,
  ) {}

  // Verifies the user is assigned to this specific course
  private async verifyCourseOwnership(
    courseId: string,
    instructorId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });

    if (!mapping) {
      throw new ForbiddenException(
        'You are not authorized to modify this course.',
      );
    }
  }

  async create(dto: CreateLectureDto, instructorId: string, role: Role) {
    await this.verifyCourseOwnership(dto.courseId, instructorId, role);

    return this.prisma.lecture.create({
      data: {
        title: dto.title,
        description: dto.description,
        sortOrder: dto.sortOrder || 0,
        isPublished: dto.isPublished || false,
        courseId: dto.courseId,
        chapterId: dto.chapterId || null,
        durationDays: dto.durationDays || 0,
        durationHours: dto.durationHours || 0,
        durationMinutes: dto.durationMinutes || 0,
        warningHours: dto.warningHours || 0,
        warningMinutes: dto.warningMinutes || 0,
      },
    });
  }

  async findByCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');

    return this.prisma.lecture.findMany({
      where: { courseId, },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const lecture = await this.prisma.lecture.findFirst({
      where: { id, },
    });
    if (!lecture)
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    return lecture;
  }

  async update(
    id: string,
    dto: Partial<CreateLectureDto>,
    userId: string,
    role: Role,
  ) {
    const lecture = await this.findOne(id);
    await this.verifyCourseOwnership(lecture.courseId, userId, role);

    return this.prisma.lecture.update({
      where: { id },
      data: dto,
    });
  }

  async updateThumbnail(
    id: string,
    thumbnailUrl: string,
    userId: string,
    role: Role,
  ) {
    const lecture = await this.findOne(id);
    await this.verifyCourseOwnership(lecture.courseId, userId, role);

    return this.prisma.lecture.update({
      where: { id },
      data: { thumbnailUrl },
    });
  }

  async remove(id: string, userId: string, role: Role) {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id },
      include: { 
        attachments: true,
        sessions: true 
      }
    });
    if (!lecture) throw new NotFoundException('Lecture not found.');
    await this.verifyCourseOwnership(lecture.courseId, userId, role);

    const urlsToDelete: string[] = [];
    if (lecture.thumbnailUrl) urlsToDelete.push(lecture.thumbnailUrl);
    for (const att of lecture.attachments || []) {
      urlsToDelete.push(att.fileUrl);
    }
    for (const session of lecture.sessions || []) {
      if (session.videoUrl) urlsToDelete.push(session.videoUrl);
    }

    if (urlsToDelete.length > 0) {
      const bucketName = process.env.R2_BUCKET_NAME;
      const endpoint = process.env.R2_ENDPOINT;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const publicUrl = process.env.R2_PUBLIC_URL;

      if (bucketName && endpoint && accessKeyId && secretAccessKey) {
        const { S3Client, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint,
          credentials: { accessKeyId, secretAccessKey },
        });

        const keys = urlsToDelete.map(url => {
          let key = url;
          if (publicUrl && url.startsWith(publicUrl)) {
            key = url.substring(publicUrl.length + 1);
          } else if (url.startsWith('https://')) {
            try {
              const urlObj = new URL(url);
              key = urlObj.pathname.substring(1);
            } catch (e) {}
          }
          return key;
        });

        try {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
          }));
        } catch (error) {
          console.error('Failed to delete objects from R2', error);
        }
      }
    }

    return this.prisma.lecture.delete({ where: { id } });
  }

  async reorder(
    lectureId: string,
    items: { id: string; type: string; orderIndex: number }[],
    userId: string,
    role: Role,
  ) {
    const lecture = await this.findOne(lectureId);
    await this.verifyCourseOwnership(lecture.courseId, userId, role);

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.type === 'SESSION') {
          await tx.session.update({
            where: { id: item.id, },
            data: { sortOrder: item.orderIndex },
          });
        } else if (item.type === 'QUIZ') {
          await tx.quiz.update({
            where: { id: item.id, },
            data: { sortOrder: item.orderIndex },
          });
        } else if (item.type === 'ATTACHMENT') {
          await tx.attachment.update({
            where: { id: item.id },
            data: { orderIndex: item.orderIndex },
          });
        }
      }
    });
  }

  async startAccess(lectureId: string, studentId: string) {
    const lecture = await this.findOne(lectureId);
    
    // Check if they already have an unstarted lecture access
    const existingAccess = await this.prisma.studentLectureAccess.findFirst({
      where: { studentId, lectureId },
    });

    const now = new Date();
    const daysMs = (lecture.durationDays || 0) * 24 * 60 * 60 * 1000;
    const hoursMs = (lecture.durationHours || 0) * 60 * 60 * 1000;
    const minutesMs = (lecture.durationMinutes || 0) * 60 * 1000;
    const totalAccessDurationMs = daysMs + hoursMs + minutesMs;
    const expiresAt = totalAccessDurationMs > 0 ? new Date(now.getTime() + totalAccessDurationMs) : null;

    const course = await this.prisma.course.findUnique({ where: { id: lecture.courseId } });
    const isFree = course?.isFree || false;

    if (existingAccess) {
      if (existingAccess.isStarted && !isFree) {
        throw new BadRequestException('Timer has already been started for this lecture.');
      }
      
      // If the course is free, we just ensure it's started but we don't modify the original expiresAt 
      // so it can safely revert if the course becomes paid again.
      if (isFree && !existingAccess.isStarted) {
        return this.prisma.studentLectureAccess.update({
          where: { id: existingAccess.id },
          data: {
            isStarted: true,
            activatedAt: now,
            // Keep the original calculated expiresAt
            expiresAt,
          },
        });
      }

      if (!isFree) {
        return this.prisma.studentLectureAccess.update({
          where: { id: existingAccess.id },
          data: {
            isStarted: true,
            activatedAt: now,
            expiresAt,
          },
        });
      }
      
      return existingAccess;
    }

    // Otherwise, check if they have course access
    const courseAccess = await this.prisma.studentCourseAccess.findFirst({
      where: { studentId, courseId: lecture.courseId },
    });

    if (!courseAccess && !isFree) {
      throw new ForbiddenException('You must redeem a code to access this lecture.');
    }
    
    if (!isFree && courseAccess && courseAccess.expiresAt && now > courseAccess.expiresAt) {
      throw new ForbiddenException('Your course access has expired.');
    }

    // Create the lecture access since they have course access
    return this.prisma.studentLectureAccess.create({
      data: {
        studentId,
        lectureId,
        isStarted: true,
        activatedAt: now,
        expiresAt,
      },
    });
  }

  // --- Phase D: Secure Streaming Token ---
  async getSecureStreamToken(sessionId: string, studentId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId, },
      include: { lecture: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    const access = await this.prisma.studentLectureAccess.findFirst({
      where: {
        studentId,
        lectureId: session.lectureId,
        },
    });

    const course = await this.prisma.course.findUnique({ where: { id: session.lecture.courseId } });
    const isFree = course?.isFree || false;

    if (!isFree) {
      if (!access) {
        throw new ForbiddenException('You must redeem a code to access this session.');
      }

      if (!access.isStarted) {
        throw new ForbiddenException('You must start the lecture before accessing the video.');
      }

      if (access.expiresAt && new Date() > access.expiresAt) {
        throw new ForbiddenException('Your access to this lecture has expired.');
      }
    }

    if (!session.videoUrl) {
      throw new NotFoundException('Video not found for this session');
    }

    let videoId = session.videoUrl;
    
    // If it's a direct video URL (R2, S3, HTTP/HTTPS MP4/WebM video, YouTube, or local /uploads/), return it directly
    if (
      videoId.startsWith('/uploads/') || 
      videoId.startsWith('http://') || 
      videoId.startsWith('https://')
    ) {
      // Unless it is explicitly a cloudflarestream.com URL, return direct URL
      if (!videoId.includes('cloudflarestream.com')) {
        return { playbackUrl: videoId };
      }
    }

    if (videoId.includes('cloudflarestream.com')) {
      const match = videoId.match(/([a-f0-9]{32})/);
      if (match) videoId = match[1];
    }

    return {
      playbackUrl: this.cloudflareService.generateSignedUrl(videoId),
    };
  }
}

