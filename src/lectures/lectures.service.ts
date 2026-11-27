import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { LectureAccessSource, Role } from '@prisma/client';
import { courseLevelAccessApplies, effectiveLectureAccess, isLectureLocked } from '../common/lecture-lock.policy';
import { deleteNotificationsForLecture } from '../notifications/content-notification-outbox';
import { filterUnreferencedUrls } from '../common/storage-refs';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { ViewLimitService } from '../sessions/view-limit.service';

@Injectable()
export class LecturesService {
  constructor(
    private prisma: PrismaService,
    private cloudflareService: CloudflareService,
    private viewLimitService: ViewLimitService,
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
        // maxViews: null = unlimited (omitted or null from DTO)
        maxViews: dto.maxViews ?? null,
        requiresOwnCode: dto.requiresOwnCode ?? false,
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
    dto: UpdateLectureDto,
    userId: string,
    role: Role,
  ) {
    const lecture = await this.findOne(id);
    await this.verifyCourseOwnership(lecture.courseId, userId, role);

    // Build explicit update data so that maxViews=null (remove limit) is handled correctly.
    // Prisma interprets undefined as "don't change" and null as "set to null".
    const data: Record<string, any> = { ...dto };
    if ('maxViews' in dto) {
      // Allow explicit null to remove the limit (→ unlimited)
      data.maxViews = dto.maxViews ?? null;
    }

    return this.prisma.lecture.update({
      where: { id },
      data,
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
        sessions: true,
      },
    });
    if (!lecture) throw new NotFoundException('Lecture not found.');
    await this.verifyCourseOwnership(lecture.courseId, userId, role);

    const candidateUrls: string[] = [];
    if (lecture.thumbnailUrl) candidateUrls.push(lecture.thumbnailUrl);
    for (const att of lecture.attachments || []) candidateUrls.push(att.fileUrl);
    for (const session of lecture.sessions || []) {
      if (session.videoUrl) candidateUrls.push(session.videoUrl);
    }

    // 1. Database first: if this fails nothing is lost, and storage is only touched after it succeeded.
    const [deleted] = await this.prisma.$transaction([
      this.prisma.lecture.delete({ where: { id } }),
      deleteNotificationsForLecture(this.prisma, id),
    ]);

    // 2. Storage: skip anything still used elsewhere (e.g. a copy of this lecture in another course).
    const unreferenced = await filterUnreferencedUrls(this.prisma, candidateUrls);
    const isStreamVideo = (url: string) =>
      url.includes('cloudflarestream.com') || url.includes('videodelivery.net') || /^[a-f0-9]{32}$/i.test(url);
    const videoUrls = new Set((lecture.sessions || []).map((s) => s.videoUrl).filter(Boolean) as string[]);

    const urlsToDelete: string[] = [];
    for (const url of unreferenced) {
      if (videoUrls.has(url) && isStreamVideo(url)) {
        try {
          await this.cloudflareService.deleteVideo?.(url);
        } catch (error) {
          console.error('Failed to delete video from Cloudflare Stream', error);
        }
      } else {
        urlsToDelete.push(url);
      }
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

    return deleted;
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
      // Scoped to this lecture: an id from another lecture is ignored instead of being reordered there.
      for (const item of items) {
        if (item.type === 'SESSION') {
          await tx.session.updateMany({
            where: { id: item.id, lectureId },
            data: { sortOrder: item.orderIndex },
          });
        } else if (item.type === 'QUIZ') {
          await tx.quiz.updateMany({
            where: { id: item.id, lectureId },
            data: { sortOrder: item.orderIndex },
          });
        } else if (item.type === 'ATTACHMENT') {
          await tx.attachment.updateMany({
            where: { id: item.id, lectureId },
            data: { orderIndex: item.orderIndex },
          });
        }
      }
    });
  }

  async startAccess(lectureId: string, studentId: string) {
    const lecture = await this.findOne(lectureId);

    // --- Demo account bypass: grant access immediately with no restrictions ---
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if ((student as any)?.isDemo) {
      const existingAccess = await this.prisma.studentLectureAccess.findFirst({
        where: { studentId, lectureId },
      });
      if (existingAccess) return existingAccess;
      return this.prisma.studentLectureAccess.create({
        data: { studentId, lectureId, isStarted: true, activatedAt: new Date(), expiresAt: null, source: LectureAccessSource.DEMO },
      });
    }
    // --- End demo bypass ---

    const locked = isLectureLocked(lecture);

    // Check if they already have an unstarted lecture access.
    // For a locked lecture, access that only came from the course/free course does not count.
    const existingRow = await this.prisma.studentLectureAccess.findFirst({
      where: { studentId, lectureId },
    });
    const existingAccess = effectiveLectureAccess(lecture, existingRow);
    if (locked && !existingAccess) {
      throw new ForbiddenException('This lecture is locked. Redeem a lecture code to unlock it.');
    }

    const now = new Date();
    const daysMs = (lecture.durationDays || 0) * 24 * 60 * 60 * 1000;
    const hoursMs = (lecture.durationHours || 0) * 60 * 60 * 1000;
    const minutesMs = (lecture.durationMinutes || 0) * 60 * 1000;
    const totalAccessDurationMs = daysMs + hoursMs + minutesMs;
    const expiresAt = totalAccessDurationMs > 0 ? new Date(now.getTime() + totalAccessDurationMs) : null;

    const course = await this.prisma.course.findUnique({ where: { id: lecture.courseId } });
    const isFree = (course?.isFree || false) && courseLevelAccessApplies(lecture);

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

    // Create the lecture access since they have course access (or the course is free)
    return this.prisma.studentLectureAccess.create({
      data: {
        studentId,
        lectureId,
        isStarted: true,
        activatedAt: now,
        expiresAt,
        source: courseAccess ? LectureAccessSource.COURSE : LectureAccessSource.FREE,
      },
    });
  }

  // --- Phase D: Secure Streaming Token ---
  async getSecureStreamToken(sessionId: string, studentId: string, role?: Role, browserId?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId, },
      include: { lecture: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (role === Role.INSTRUCTOR) {
      await this.verifyCourseOwnership(session.lecture.courseId, studentId, role);
      // Instructor bypasses all time limits and view limits
      let videoId = session.videoUrl;
      if (!videoId) throw new NotFoundException('Video not found');
      
      if (
        videoId.startsWith('/uploads/') || 
        videoId.startsWith('http://') || 
        videoId.startsWith('https://')
      ) {
        if (
          !videoId.includes('cloudflarestream.com') &&
          !videoId.includes('videodelivery.net')
        ) {
          return { playbackUrl: videoId, playbackSessionId: 'instructor-bypass' };
        }
      }
      if (
        videoId.includes('cloudflarestream.com') ||
        videoId.includes('videodelivery.net')
      ) {
        const match = videoId.match(/\/([a-f0-9]{32})(?:\/|\?|$)/i);
        if (match) videoId = match[1];
      }
      return {
        playbackUrl: this.cloudflareService.generateSignedUrl(videoId),
        playbackSessionId: 'instructor-bypass',
      };
    }

    // --- Demo account bypass: skip all access, expiry, and view-limit checks ---
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    const isDemo = (student as any)?.isDemo === true;

    if (!isDemo) {
      const access = effectiveLectureAccess(
        session.lecture,
        await this.prisma.studentLectureAccess.findFirst({
          where: { studentId, lectureId: session.lectureId },
        }),
      );

      const course = await this.prisma.course.findUnique({ where: { id: session.lecture.courseId } });
      const isFree = (course?.isFree || false) && courseLevelAccessApplies(session.lecture);

      if (!isFree) {
        if (!access) {
          throw new ForbiddenException('You must redeem a code to access this session.');
        }

        if (!access.isStarted) {
          throw new ForbiddenException('You must start the lecture before accessing the video.');
        }

        // Existing time-limit check (unchanged)
        if (access.expiresAt && new Date() > access.expiresAt) {
          throw new ForbiddenException('Your access to this lecture has expired.');
        }
      }

      // View Limit Check — only for non-demo students with a video URL
      if (session.videoUrl) {
        await this.viewLimitService.assertCanWatch(sessionId, studentId);
      }
    }
    // --- End demo bypass ---

    if (!session.videoUrl) {
      throw new NotFoundException('Video not found for this session');
    }

    // Create an idempotency token for this viewing session.
    // The frontend will send this back when the threshold is reached.
    const playbackSessionId = await this.viewLimitService.createPlaybackSession(
      sessionId,
      studentId,
      browserId,
    );

    let videoId = session.videoUrl;
    
    // If it's a direct video URL (R2, S3, HTTP/HTTPS MP4/WebM video, YouTube, or local /uploads/), return it directly
    if (
      videoId.startsWith('/uploads/') || 
      videoId.startsWith('http://') || 
      videoId.startsWith('https://')
    ) {
      // Unless it is explicitly a cloudflarestream.com or videodelivery.net URL, return direct URL
      if (
        !videoId.includes('cloudflarestream.com') &&
        !videoId.includes('videodelivery.net')
      ) {
        return { playbackUrl: videoId, playbackSessionId };
      }
    }

    if (
      videoId.includes('cloudflarestream.com') ||
      videoId.includes('videodelivery.net')
    ) {
      const match = videoId.match(/\/([a-f0-9]{32})(?:\/|\?|$)/i);
      if (match) videoId = match[1];
    }

    return {
      playbackUrl: this.cloudflareService.generateSignedUrl(videoId),
      playbackSessionId,
    };
  }
}
