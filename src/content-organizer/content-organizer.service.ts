import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  cancelPendingNotificationsForTarget,
  deleteNotificationsForLecture,
  enqueueLectureMaterialNotification,
  enqueueSessionVideoNotification,
} from '../notifications/content-notification-outbox';
import type { LectureDestinationDto, MaterialKind, MoveMaterialDto } from './dto/content-organizer.dto';

type Tx = Prisma.TransactionClient;

// Interactive transactions here can touch many rows (copying a big lecture).
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/**
 * Re-organising course content without re-uploading anything:
 *  - move a lecture to another chapter and/or another course
 *  - copy a lecture (videos, files, quizzes) into a course
 *  - move a handout between lectures / chapters / the course level, rename it, reorder lecture files
 *
 * NOTE: inside a transaction we only use findFirst (never findUnique) on soft-delete models —
 * PrismaService routes findUnique on those models OUTSIDE the transaction.
 */
@Injectable()
export class ContentOrganizerService {
  constructor(private prisma: PrismaService) {}

  // ─── Destinations (for the admin pickers) ──────────────────────────────────

  async getTree() {
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        chapters: {
          where: { deletedAt: null },
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, title: true },
        },
        lectures: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, title: true, chapterId: true, requiresOwnCode: true },
        },
      },
    });
    return courses;
  }

  // ─── Lectures ──────────────────────────────────────────────────────────────

  private async resolveLectureDestination(tx: Tx, dest: LectureDestinationDto) {
    const course = await tx.course.findFirst({ where: { id: dest.courseId }, select: { id: true, type: true, title: true } });
    if (!course) throw new NotFoundException('Target course not found.');
    const chapterId = dest.chapterId ?? null;
    if (chapterId) {
      const chapter = await tx.chapter.findFirst({ where: { id: chapterId }, select: { courseId: true } });
      if (!chapter) throw new NotFoundException('Target chapter not found.');
      if (chapter.courseId !== course.id) throw new BadRequestException('That chapter belongs to a different course.');
    }
    const max = await tx.lecture.aggregate({
      where: { courseId: course.id, chapterId },
      _max: { sortOrder: true },
    });
    return { course, chapterId, nextSortOrder: (max._max.sortOrder ?? -1) + 1 };
  }

  private async assertCourseAcceptsVideos(tx: Tx, courseType: string, lectureId: string) {
    if (courseType !== CourseType.MATERIALS_ONLY) return;
    const videos = await tx.session.count({ where: { lectureId } });
    if (videos > 0) {
      throw new BadRequestException(
        'The target course is materials-only and cannot show video sessions. Remove the sessions first or choose another course.',
      );
    }
  }

  /** Announce a lecture that just arrived in a course (by move or copy) to that course's students. */
  private async announceArrivedLecture(tx: Tx, lectureId: string) {
    const [sessions, attachments] = await Promise.all([
      tx.session.findMany({ where: { lectureId, videoUrl: { not: null } }, select: { id: true } }),
      tx.attachment.findMany({ where: { lectureId }, select: { id: true } }),
    ]);
    for (const s of sessions) await enqueueSessionVideoNotification(tx, s.id, new Date(), { asNewLecture: true });
    for (const a of attachments) await enqueueLectureMaterialNotification(tx, a.id);
  }

  /**
   * Move a lecture to another chapter of the same course, or to another course (cut & paste).
   * Moving to ANOTHER course resets every student's individual access to it (decided by the business):
   * students of the new course get it through that course; lecture-code buyers must unlock it again.
   */
  async moveLecture(lectureId: string, dest: LectureDestinationDto) {
    return this.prisma.$transaction(async (tx) => {
      const lecture = await tx.lecture.findFirst({ where: { id: lectureId } });
      if (!lecture) throw new NotFoundException('Lecture not found.');

      const target = await this.resolveLectureDestination(tx, dest);
      const sameCourse = target.course.id === lecture.courseId;
      if (sameCourse && (lecture.chapterId ?? null) === target.chapterId) {
        return { lecture, movedToAnotherCourse: false, studentAccessRemoved: 0 };
      }
      if (!sameCourse) await this.assertCourseAcceptsVideos(tx, target.course.type, lectureId);

      const updated = await tx.lecture.update({
        where: { id: lectureId },
        data: { courseId: target.course.id, chapterId: target.chapterId, sortOrder: target.nextSortOrder },
      });

      if (sameCourse) return { lecture: updated, movedToAnotherCourse: false, studentAccessRemoved: 0 };

      // Cross-course move.
      const removed = await tx.studentLectureAccess.deleteMany({ where: { lectureId } });
      await tx.playbackSession.updateMany({
        where: { videoSession: { lectureId }, consumed: false, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date(0) },
      });
      // Lecture-scoped exams follow their lecture.
      await tx.exam.updateMany({ where: { lectureId, courseId: { not: null } }, data: { courseId: target.course.id } });
      await tx.exam.updateMany({ where: { lectureId, chapterId: { not: null } }, data: { chapterId: target.chapterId } });
      // Old notifications point students of the old course to a lecture they can no longer open.
      await deleteNotificationsForLecture(tx, lectureId);
      await this.announceArrivedLecture(tx, lectureId);

      return { lecture: updated, movedToAnotherCourse: true, studentAccessRemoved: removed.count };
    }, TX_OPTIONS);
  }

  /**
   * Copy a lecture (with its sessions, files and quizzes) into a course/chapter. Videos and files are
   * shared, not re-uploaded; deleting one copy never deletes storage another copy still uses
   * (see common/storage-refs). Student data (access, progress, attempts) is not copied.
   */
  async copyLecture(lectureId: string, dest: LectureDestinationDto) {
    return this.prisma.$transaction(async (tx) => {
      const src = await tx.lecture.findFirst({ where: { id: lectureId } });
      if (!src) throw new NotFoundException('Lecture not found.');

      const target = await this.resolveLectureDestination(tx, dest);
      await this.assertCourseAcceptsVideos(tx, target.course.type, lectureId);

      const copy = await tx.lecture.create({
        data: {
          courseId: target.course.id,
          chapterId: target.chapterId,
          title: target.course.id === src.courseId ? `${src.title} (copy)` : src.title,
          description: src.description,
          sortOrder: target.nextSortOrder,
          orderIndex: src.orderIndex,
          isPublished: src.isPublished,
          thumbnailUrl: src.thumbnailUrl, // shared; thumbnailMediaId is unique, so it is not copied
          validityDays: src.validityDays,
          durationDays: src.durationDays,
          durationHours: src.durationHours,
          durationMinutes: src.durationMinutes,
          warningHours: src.warningHours,
          warningMinutes: src.warningMinutes,
          maxViews: src.maxViews,
          requiresOwnCode: src.requiresOwnCode,
        },
      });

      const [sessions, attachments, quizzes] = await Promise.all([
        tx.session.findMany({ where: { lectureId }, orderBy: { sortOrder: 'asc' } }),
        tx.attachment.findMany({ where: { lectureId }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] }),
        tx.quiz.findMany({ where: { lectureId }, include: { questions: true }, orderBy: { sortOrder: 'asc' } }),
      ]);

      if (sessions.length) {
        await tx.session.createMany({
          data: sessions.map((s) => ({
            lectureId: copy.id,
            title: s.title,
            description: s.description,
            videoUrl: s.videoUrl, // shared video; videoMediaId is unique, so it is not copied
            duration: s.duration,
            sortOrder: s.sortOrder,
            orderIndex: s.orderIndex,
            isPublished: s.isPublished,
          })),
        });
      }
      if (attachments.length) {
        await tx.attachment.createMany({
          data: attachments.map((a) => ({
            lectureId: copy.id,
            title: a.title,
            fileUrl: a.fileUrl,
            mediaId: a.mediaId,
            type: a.type,
            orderIndex: a.orderIndex,
            isPublished: a.isPublished,
            allowDownload: a.allowDownload,
          })),
        });
      }
      for (const q of quizzes) {
        const newQuiz = await tx.quiz.create({
          data: {
            lectureId: copy.id,
            title: q.title,
            description: q.description,
            passGrade: q.passGrade,
            maxAttempts: q.maxAttempts,
            isPublished: q.isPublished,
            timeLimit: q.timeLimit,
            sortOrder: q.sortOrder,
            orderIndex: q.orderIndex,
            isRevision: q.isRevision,
          },
        });
        if (q.questions.length) {
          await tx.quizQuestion.createMany({
            data: q.questions.map((qq) => ({
              quizId: newQuiz.id,
              text: qq.text,
              type: qq.type,
              options: qq.options,
              correctOptionIndex: qq.correctOptionIndex,
              points: qq.points,
              orderIndex: qq.orderIndex,
              version: qq.version,
              referenceAnswer: qq.referenceAnswer,
              matchOptions: qq.matchOptions === null ? Prisma.DbNull : (qq.matchOptions as Prisma.InputJsonValue),
              correctOrder: qq.correctOrder,
            })),
          });
        }
      }

      await this.announceArrivedLecture(tx, copy.id);
      return {
        lecture: copy,
        copied: { sessions: sessions.length, files: attachments.length, quizzes: quizzes.length },
      };
    }, TX_OPTIONS);
  }

  // ─── Handouts / materials ──────────────────────────────────────────────────

  private async loadMaterial(tx: Tx, kind: MaterialKind, id: string) {
    if (kind === 'lecture') {
      const a = await tx.attachment.findFirst({ where: { id } });
      if (!a) throw new NotFoundException('File not found.');
      return { kind, id: a.id, title: a.title, fileUrl: a.fileUrl, mediaId: a.mediaId, type: a.type, parentId: a.lectureId };
    }
    if (kind === 'chapter') {
      const a = await tx.chapterAttachment.findFirst({ where: { id } });
      if (!a) throw new NotFoundException('File not found.');
      return { kind, id: a.id, title: a.title, fileUrl: a.fileUrl, mediaId: a.mediaId, type: a.type, parentId: a.chapterId };
    }
    const a = await tx.courseAttachment.findFirst({ where: { id } });
    if (!a) throw new NotFoundException('File not found.');
    return { kind, id: a.id, title: a.title, fileUrl: a.fileUrl, mediaId: a.mediaId, type: a.type, parentId: a.courseId };
  }

  private async assertTargetExists(tx: Tx, kind: MaterialKind, id: string) {
    const found =
      kind === 'lecture'
        ? await tx.lecture.findFirst({ where: { id }, select: { id: true } })
        : kind === 'chapter'
          ? await tx.chapter.findFirst({ where: { id }, select: { id: true } })
          : await tx.course.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Target ${kind} not found.`);
  }

  private async nextLectureFileOrder(tx: Tx, lectureId: string) {
    const max = await tx.attachment.aggregate({ where: { lectureId }, _max: { orderIndex: true } });
    return (max._max.orderIndex ?? -1) + 1;
  }

  /**
   * Move a handout to a lecture, a chapter, or the course level (any course).
   * Lecture files keep their id, download policy and single-file-code buyers when moved between lectures.
   */
  async moveMaterial(kind: MaterialKind, id: string, dto: MoveMaterialDto) {
    return this.prisma.$transaction(async (tx) => {
      const m = await this.loadMaterial(tx, kind, id);
      await this.assertTargetExists(tx, dto.targetKind, dto.targetId);
      if (dto.targetKind === kind && dto.targetId === m.parentId) return { kind, id, unchanged: true };

      // lecture → lecture: a simple re-parent (keeps id, codes, download policy, buyers).
      if (kind === 'lecture' && dto.targetKind === 'lecture') {
        await tx.attachment.update({
          where: { id },
          data: { lectureId: dto.targetId, orderIndex: await this.nextLectureFileOrder(tx, dto.targetId) },
        });
        await cancelPendingNotificationsForTarget(tx, id);
        return { kind: 'lecture' as const, id };
      }

      // Leaving the lecture level would delete the lecture-file row; refuse if students bought it on its own.
      if (kind === 'lecture') {
        const [buyers, codes] = await Promise.all([
          tx.studentFileAccess.count({ where: { attachmentId: id } }),
          tx.activationCode.count({ where: { redeemedAttachmentId: id } }),
        ]);
        if (buyers > 0 || codes > 0) {
          throw new ConflictException(
            'Students unlocked this file with a single-file code, so it must stay inside a lecture. Move it to another lecture instead.',
          );
        }
      }

      const base = { title: m.title, fileUrl: m.fileUrl, mediaId: m.mediaId, type: m.type };
      let created: { id: string };
      if (dto.targetKind === 'lecture') {
        created = await tx.attachment.create({
          data: { ...base, lectureId: dto.targetId, orderIndex: await this.nextLectureFileOrder(tx, dto.targetId) },
        });
      } else if (dto.targetKind === 'chapter') {
        created = await tx.chapterAttachment.create({ data: { ...base, chapterId: dto.targetId } });
      } else {
        created = await tx.courseAttachment.create({ data: { ...base, courseId: dto.targetId } });
      }

      // Remove the old row (same storage object is now owned by the new row — nothing is deleted from storage).
      if (kind === 'lecture') {
        await cancelPendingNotificationsForTarget(tx, id);
        await tx.attachment.delete({ where: { id } });
      } else if (kind === 'chapter') {
        await tx.chapterAttachment.delete({ where: { id } });
      } else {
        await tx.courseAttachment.delete({ where: { id } });
      }

      // A chapter/course file placed into a lecture becomes visible to students → tell them.
      if (dto.targetKind === 'lecture') await enqueueLectureMaterialNotification(tx, created.id);

      return { kind: dto.targetKind, id: created.id };
    }, TX_OPTIONS);
  }

  async renameMaterial(kind: MaterialKind, id: string, title: string) {
    const clean = title.trim();
    if (!clean) throw new BadRequestException('Title cannot be empty.');
    return this.prisma.$transaction(async (tx) => {
      await this.loadMaterial(tx, kind, id);
      if (kind === 'lecture') return tx.attachment.update({ where: { id }, data: { title: clean } });
      if (kind === 'chapter') return tx.chapterAttachment.update({ where: { id }, data: { title: clean } });
      return tx.courseAttachment.update({ where: { id }, data: { title: clean } });
    });
  }

  /** Set the order of a lecture's files (ids must be exactly that lecture's files). */
  async reorderLectureMaterials(lectureId: string, ids: string[]) {
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate file ids.');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attachment.findMany({ where: { lectureId }, select: { id: true } });
      const set = new Set(existing.map((e) => e.id));
      if (ids.length !== set.size || ids.some((i) => !set.has(i))) {
        throw new BadRequestException("The list must contain exactly this lecture's files.");
      }
      for (let i = 0; i < ids.length; i++) {
        await tx.attachment.update({ where: { id: ids[i] }, data: { orderIndex: i } });
      }
      return tx.attachment.findMany({ where: { lectureId }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
    }, TX_OPTIONS);
  }
}
