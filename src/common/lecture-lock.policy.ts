import { LectureAccessSource } from '@prisma/client';

/**
 * Locked lectures ("requiresOwnCode").
 *
 * A locked lecture is sold separately: full-course access, free-course access and course-files
 * (materials) codes do NOT open it — not its videos, quizzes or files. Only a StudentLectureAccess row
 * that came from a lecture code (or an admin grant / demo account) counts.
 *
 * Every place that decides "can this student open this lecture / its files" must go through these
 * helpers so the rule stays identical everywhere (playlist, course page, streaming, files, quizzes,
 * notifications).
 */
export const OWN_LECTURE_ACCESS_SOURCES: readonly LectureAccessSource[] = [
  LectureAccessSource.CODE,
  LectureAccessSource.ADMIN,
  LectureAccessSource.DEMO,
];

export interface LockableLecture {
  requiresOwnCode?: boolean | null;
}

export function isLectureLocked(lecture: LockableLecture | null | undefined): boolean {
  return !!lecture?.requiresOwnCode;
}

/** True when this access row was obtained for the lecture itself (code / admin / demo). */
export function isOwnLectureAccess(row: { source?: string | null } | null | undefined): boolean {
  return !!row && OWN_LECTURE_ACCESS_SOURCES.includes(row.source as LectureAccessSource);
}

/**
 * The lecture-access row that actually applies. For a locked lecture, a row that only came from
 * the course (or a free course) is ignored; for normal lectures the row is returned unchanged.
 */
export function effectiveLectureAccess<T extends { source?: string | null }>(
  lecture: LockableLecture | null | undefined,
  row: T | null | undefined,
): T | null {
  if (!row) return null;
  if (!isLectureLocked(lecture)) return row;
  return isOwnLectureAccess(row) ? row : null;
}

/** Whether full-course access, free-course status or a course-files code may open this lecture. */
export function courseLevelAccessApplies(lecture: LockableLecture | null | undefined): boolean {
  return !isLectureLocked(lecture);
}
