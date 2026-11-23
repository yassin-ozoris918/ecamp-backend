import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ContentNotificationType, CourseStatus, NotificationEvent, NotificationOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRecipientsService } from './notification-recipients';
import {
  NOTIFICATION_BATCH_GROUPS,
  NOTIFICATION_INSERT_CHUNK,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_POLL_MS,
  NOTIFICATION_PURGE_INTERVAL_MS,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_STALE_LOCK_MS,
  kindFromGroupKey,
  notificationRetryDelayMs,
} from './notification.constants';

export interface NotificationParams {
  courseTitle: string;
  lectureTitle: string;
  itemTitle: string;
  count: number;
}

type GroupOutcome = { recipients: number; skipped?: string };

/**
 * Background fan-out of the NotificationEvent outbox into per-student Notification rows.
 *
 * Safety properties:
 *  - Claiming uses a single conditional UPDATE, so two API instances never process the same event.
 *  - Inserts use the unique (eventId, userId) + skipDuplicates, so a retry after a crash never
 *    produces a duplicate notification.
 *  - Content is re-validated at send time (deleted, unpublished, video removed → nothing is sent).
 *  - Failures back off exponentially and stop at FAILED after NOTIFICATION_MAX_ATTEMPTS
 *    (visible in the DB for support; they never block other events).
 */
@Injectable()
export class NotificationWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private lastPurgeAt = 0;

  constructor(
    private prisma: PrismaService,
    private recipients: NotificationRecipientsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.NOTIFICATIONS_WORKER_ENABLED === 'false') {
      this.logger.log('Notification worker disabled for this process.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), NOTIFICATION_POLL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** One worker pass. Public so tests and ops scripts can drive it directly. */
  async tick(): Promise<void> {
    if (this.running) return; // never overlap passes inside one process
    this.running = true;
    try {
      await this.requeueStaleLocks();
      // Drain everything that is due, a batch of groups at a time.
      for (let i = 0; i < 50 && !this.stopped; i++) {
        const processed = await this.processDueBatch();
        if (processed === 0) break;
      }
      await this.purgeOldIfDue();
    } catch (err) {
      this.logger.error(`Notification worker pass failed: ${(err as Error)?.message}`, (err as Error)?.stack);
    } finally {
      this.running = false;
    }
  }

  private async requeueStaleLocks() {
    const { count } = await this.prisma.notificationEvent.updateMany({
      where: {
        status: NotificationOutboxStatus.PROCESSING,
        lockedAt: { lt: new Date(Date.now() - NOTIFICATION_STALE_LOCK_MS) },
      },
      data: { status: NotificationOutboxStatus.PENDING, lockedAt: null },
    });
    if (count) this.logger.warn(`Re-queued ${count} stale notification event(s).`);
  }

  /** Atomically claims every PENDING event of up to N groups that are due. Returns the number of groups handled. */
  async processDueBatch(): Promise<number> {
    // Prisma stores DateTime as UTC "timestamp without time zone"; compare in UTC regardless of DB session TZ.
    const claimed = await this.prisma.$queryRaw<{ id: string; groupKey: string }[]>(Prisma.sql`
      UPDATE "NotificationEvent" AS e
      SET "status" = 'PROCESSING',
          "lockedAt" = (NOW() AT TIME ZONE 'UTC'),
          "attempts" = e."attempts" + 1
      WHERE e."status" = 'PENDING'
        AND e."groupKey" IN (
          SELECT "groupKey" FROM "NotificationEvent"
          WHERE "status" = 'PENDING' AND "scheduledFor" <= (NOW() AT TIME ZONE 'UTC')
          GROUP BY "groupKey"
          ORDER BY MIN("scheduledFor") ASC
          LIMIT ${NOTIFICATION_BATCH_GROUPS}
        )
      RETURNING e."id", e."groupKey"
    `);
    if (claimed.length === 0) return 0;

    const byGroup = new Map<string, string[]>();
    for (const row of claimed) {
      const ids = byGroup.get(row.groupKey) ?? [];
      ids.push(row.id);
      byGroup.set(row.groupKey, ids);
    }

    for (const ids of byGroup.values()) {
      const events = await this.prisma.notificationEvent.findMany({
        where: { id: { in: ids } },
        orderBy: { createdAt: 'asc' },
      });
      if (events.length === 0) continue; // deleted meanwhile (content removed)
      try {
        const outcome = await this.processGroup(events);
        await this.markDone(events, outcome);
      } catch (err) {
        await this.markFailedAttempt(events, err as Error);
      }
    }
    return byGroup.size;
  }

  /** Builds and inserts the student notifications for one merged group of events. */
  async processGroup(events: NotificationEvent[], now = new Date()): Promise<GroupOutcome> {
    const lead = events[0];
    const kind = kindFromGroupKey(lead.groupKey);
    if (!kind) return { recipients: 0, skipped: `unknown group ${lead.groupKey}` };

    const lecture = await this.recipients.loadLectureContext(lead.lectureId);
    const course = lecture?.course;
    if (!lecture || lecture.deletedAt || !course || course.deletedAt) return { recipients: 0, skipped: 'lecture/course removed' };
    if (course.status !== CourseStatus.PUBLISHED) return { recipients: 0, skipped: 'course not published' };

    // Re-validate the items: only count those that still exist (and, for videos, still have a video).
    const targetIds = events.map((e) => e.targetId);
    const liveTargets =
      kind === 'VIDEO'
        ? await this.prisma.session.findMany({
            where: { id: { in: targetIds }, lectureId: lecture.id, videoUrl: { not: null }, deletedAt: null },
            select: { id: true, title: true },
          })
        : await this.prisma.attachment.findMany({
            where: { id: { in: targetIds }, lectureId: lecture.id, deletedAt: null },
            select: { id: true, title: true },
          });
    if (liveTargets.length === 0) return { recipients: 0, skipped: 'content removed before delivery' };

    const type: ContentNotificationType =
      kind === 'MATERIAL'
        ? ContentNotificationType.MATERIAL_ADDED
        : events.some((e) => e.type === ContentNotificationType.LECTURE_ADDED)
          ? ContentNotificationType.LECTURE_ADDED
          : ContentNotificationType.SESSION_ADDED;

    // Keep the first live item's title for the single-item message.
    const firstLive = targetIds.map((id) => liveTargets.find((t) => t.id === id)).find(Boolean)!;
    const params: NotificationParams = {
      courseTitle: course.title,
      lectureTitle: lecture.title,
      itemTitle: firstLive.title,
      count: liveTargets.length,
    };

    const recipients = await this.recipients.resolve(kind, course, lecture.id, now, !!lecture.requiresOwnCode);
    if (recipients.size === 0) return { recipients: 0, skipped: 'no enrolled students with access' };

    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const [userId, link] of recipients) {
      rows.push({
        userId,
        eventId: lead.id,
        type,
        courseId: course.id,
        lectureId: lecture.id,
        link,
        params: params as unknown as Prisma.InputJsonValue,
      });
    }
    for (let i = 0; i < rows.length; i += NOTIFICATION_INSERT_CHUNK) {
      await this.prisma.notification.createMany({ data: rows.slice(i, i + NOTIFICATION_INSERT_CHUNK), skipDuplicates: true });
    }
    return { recipients: rows.length };
  }

  private async markDone(events: NotificationEvent[], outcome: GroupOutcome) {
    const now = new Date();
    const [lead, ...rest] = events;
    await this.prisma.$transaction([
      this.prisma.notificationEvent.update({
        where: { id: lead.id },
        data: {
          status: NotificationOutboxStatus.DONE,
          processedAt: now,
          lockedAt: null,
          recipientCount: outcome.recipients,
          lastError: outcome.skipped ?? null,
        },
      }),
      this.prisma.notificationEvent.updateMany({
        where: { id: { in: rest.map((e) => e.id) } },
        data: {
          status: NotificationOutboxStatus.DONE,
          processedAt: now,
          lockedAt: null,
          lastError: `merged into ${lead.id}`,
        },
      }),
    ]);
  }

  private async markFailedAttempt(events: NotificationEvent[], err: Error) {
    const message = (err?.message ?? String(err)).slice(0, 1000);
    this.logger.error(`Notification group ${events[0].groupKey} failed: ${message}`);
    for (const e of events) {
      const exhausted = e.attempts >= NOTIFICATION_MAX_ATTEMPTS;
      await this.prisma.notificationEvent
        .update({
          where: { id: e.id },
          data: exhausted
            ? { status: NotificationOutboxStatus.FAILED, lockedAt: null, lastError: message }
            : {
                status: NotificationOutboxStatus.PENDING,
                lockedAt: null,
                lastError: message,
                scheduledFor: new Date(Date.now() + notificationRetryDelayMs(e.attempts)),
              },
        })
        .catch(() => undefined); // event row may have been deleted with its content
    }
  }

  private async purgeOldIfDue() {
    if (Date.now() - this.lastPurgeAt < NOTIFICATION_PURGE_INTERVAL_MS) return;
    this.lastPurgeAt = Date.now();
    const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await this.prisma.notificationEvent.deleteMany({
      where: { status: { in: [NotificationOutboxStatus.DONE, NotificationOutboxStatus.FAILED] }, createdAt: { lt: cutoff } },
    });
  }
}
