import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PAGE_DEFAULT, NOTIFICATION_PAGE_MAX } from './notification.constants';

/** Read side of the student inbox. Every query is scoped by userId, so a student can only ever see/modify their own rows. */
@Injectable()
export class StudentNotificationsService {
  constructor(private prisma: PrismaService) {}

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async list(userId: string, opts: { cursor?: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(opts.limit) || NOTIFICATION_PAGE_DEFAULT, 1), NOTIFICATION_PAGE_MAX);

    let cursorRow: { id: string; createdAt: Date } | null = null;
    if (opts.cursor) {
      cursorRow = await this.prisma.notification.findFirst({
        where: { id: opts.cursor, userId },
        select: { id: true, createdAt: true },
      });
    }

    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursorRow
          ? {
              OR: [
                { createdAt: { lt: cursorRow.createdAt } },
                { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        courseId: true,
        lectureId: true,
        link: true,
        params: true,
        readAt: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Show the CURRENT course / chapter / lecture names, so a notification stays accurate after a
    // rename or a move to another chapter. Falls back to the names saved when it was sent.
    const lectureIds = [...new Set(page.map((n) => n.lectureId))];
    const lectures = lectureIds.length
      ? await this.prisma.lecture.findMany({
          where: { id: { in: lectureIds } },
          select: { id: true, title: true, chapter: { select: { title: true } }, course: { select: { title: true } } },
        })
      : [];
    const live = new Map(lectures.map((l) => [l.id, l]));
    const items = page.map((n) => {
      const l = live.get(n.lectureId);
      const saved = (n.params ?? {}) as Record<string, unknown>;
      return {
        ...n,
        params: l
          ? { ...saved, courseTitle: l.course.title, chapterTitle: l.chapter?.title ?? null, lectureTitle: l.title }
          : saved,
      };
    });

    const unreadCount = await this.unreadCount(userId);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, unreadCount };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { unreadCount: await this.unreadCount(userId) };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { unreadCount: 0 };
  }
}
