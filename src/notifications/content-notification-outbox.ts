import { ContentNotificationType, NotificationOutboxStatus, Prisma } from '@prisma/client';
import {
  NOTIFICATION_DEBOUNCE_MS,
  NOTIFICATION_MAX_DEBOUNCE_MS,
  materialDedupeKey,
  materialGroupKey,
  videoDedupeKey,
  videoGroupKey,
} from './notification.constants';

/**
 * Outbox writers. Every function takes the SAME transaction client that creates/updates the
 * content row, so the content and its notification event commit (or roll back) together.
 *
 * They never throw on duplicates (createMany + skipDuplicates on the unique dedupeKey), so
 * calling them twice for the same item — e.g. a video re-upload — is a harmless no-op.
 */

type Tx = Prisma.TransactionClient;

// NOTE: use findFirst, never findUnique, on soft-delete models (Session, Attachment, …) inside a
// transaction. PrismaService rewrites findUnique on those models to a query on a DIFFERENT client,
// i.e. outside the transaction, so it would not see the row that was just created.

/** Push the debounce window of a still-pending burst forward so it is delivered as ONE notification. */
async function slideDebounceWindow(tx: Tx, groupKey: string, now: Date) {
  await tx.notificationEvent.updateMany({
    where: {
      groupKey,
      status: NotificationOutboxStatus.PENDING,
      createdAt: { gte: new Date(now.getTime() - NOTIFICATION_MAX_DEBOUNCE_MS) },
    },
    data: { scheduledFor: new Date(now.getTime() + NOTIFICATION_DEBOUNCE_MS) },
  });
}

/**
 * Call after a session gets a playable video (created with a videoUrl, or videoUrl set for the
 * first time). The first video of a lecture is announced as a NEW LECTURE; later ones as NEW SESSION.
 */
export async function enqueueSessionVideoNotification(
  tx: Tx,
  sessionId: string,
  now = new Date(),
  opts: { asNewLecture?: boolean } = {},
) {
  const session = await tx.session.findFirst({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      deletedAt: true,
      lectureId: true,
      lecture: { select: { courseId: true } },
    },
  });
  if (!session || !session.videoUrl || session.deletedAt || !session.lecture?.courseId) return;

  const [otherVideos, alreadyAnnounced] = await Promise.all([
    tx.session.count({
      where: { lectureId: session.lectureId, id: { not: session.id }, videoUrl: { not: null }, deletedAt: null },
    }),
    tx.notificationEvent.count({
      where: { groupKey: videoGroupKey(session.lectureId), status: NotificationOutboxStatus.DONE },
    }),
  ]);

  // A lecture copied/moved into a course is new there as a whole, even though it already has videos.
  const type =
    opts.asNewLecture || (otherVideos === 0 && alreadyAnnounced === 0)
      ? ContentNotificationType.LECTURE_ADDED
      : ContentNotificationType.SESSION_ADDED;

  const groupKey = videoGroupKey(session.lectureId);
  await tx.notificationEvent.createMany({
    data: [
      {
        type,
        dedupeKey: videoDedupeKey(session.id),
        groupKey,
        courseId: session.lecture.courseId,
        lectureId: session.lectureId,
        targetId: session.id,
        itemTitle: session.title,
        scheduledFor: new Date(now.getTime() + NOTIFICATION_DEBOUNCE_MS),
      },
    ],
    skipDuplicates: true,
  });
  await slideDebounceWindow(tx, groupKey, now);
}

/** Call after a lecture attachment (handout / notes / file) is created. */
export async function enqueueLectureMaterialNotification(tx: Tx, attachmentId: string, now = new Date()) {
  const attachment = await tx.attachment.findFirst({
    where: { id: attachmentId },
    select: { id: true, title: true, deletedAt: true, lectureId: true, lecture: { select: { courseId: true } } },
  });
  if (!attachment || attachment.deletedAt || !attachment.lecture?.courseId) return;

  const groupKey = materialGroupKey(attachment.lectureId);
  await tx.notificationEvent.createMany({
    data: [
      {
        type: ContentNotificationType.MATERIAL_ADDED,
        dedupeKey: materialDedupeKey(attachment.id),
        groupKey,
        courseId: attachment.lecture.courseId,
        lectureId: attachment.lectureId,
        targetId: attachment.id,
        itemTitle: attachment.title,
        scheduledFor: new Date(now.getTime() + NOTIFICATION_DEBOUNCE_MS),
      },
    ],
    skipDuplicates: true,
  });
  await slideDebounceWindow(tx, groupKey, now);
}

/**
 * A session/attachment was deleted. Cancel its notification if it has not gone out yet.
 * Already-delivered notifications are kept: they point at the lecture, which still exists.
 */
export function cancelPendingNotificationsForTarget(client: Tx, targetId: string) {
  return client.notificationEvent.deleteMany({
    where: {
      targetId,
      status: { in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.FAILED] },
    },
  });
}

/** A lecture was deleted: remove its events and (by cascade) every student notification pointing at it. */
export function deleteNotificationsForLecture(client: Tx, lectureId: string) {
  return client.notificationEvent.deleteMany({ where: { lectureId } });
}

/** A course was deleted: same as above for the whole course. */
export function deleteNotificationsForCourse(client: Tx, courseId: string) {
  return client.notificationEvent.deleteMany({ where: { courseId } });
}
