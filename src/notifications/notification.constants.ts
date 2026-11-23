/** How long after the LAST upload in a burst we wait before notifying (uploads in this window are merged). */
export const NOTIFICATION_DEBOUNCE_MS = 2 * 60 * 1000;
/** A burst can keep extending the debounce for at most this long, so a notification is never held back forever. */
export const NOTIFICATION_MAX_DEBOUNCE_MS = 15 * 60 * 1000;

/** Worker cadence and limits. */
export const NOTIFICATION_POLL_MS = 15 * 1000;
export const NOTIFICATION_BATCH_GROUPS = 20;
export const NOTIFICATION_INSERT_CHUNK = 1000;
export const NOTIFICATION_MAX_ATTEMPTS = 6;
/** A PROCESSING event older than this is assumed to belong to a crashed worker and is re-queued. */
export const NOTIFICATION_STALE_LOCK_MS = 10 * 60 * 1000;

/** Retention: inbox rows (and finished outbox rows) older than this are purged. */
export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Student API page size. */
export const NOTIFICATION_PAGE_DEFAULT = 20;
export const NOTIFICATION_PAGE_MAX = 50;

/** Retry delay after a failed fan-out: 30s, 1m, 2m, 4m, 8m … capped at 30m. */
export function notificationRetryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60 * 1000);
}

export const videoGroupKey = (lectureId: string) => `VIDEO:${lectureId}`;
export const materialGroupKey = (lectureId: string) => `MATERIAL:${lectureId}`;
export const videoDedupeKey = (sessionId: string) => `VIDEO:${sessionId}`;
export const materialDedupeKey = (attachmentId: string) => `MATERIAL:${attachmentId}`;

export type NotificationKind = 'VIDEO' | 'MATERIAL';

export function kindFromGroupKey(groupKey: string): NotificationKind | null {
  if (groupKey.startsWith('VIDEO:')) return 'VIDEO';
  if (groupKey.startsWith('MATERIAL:')) return 'MATERIAL';
  return null;
}
