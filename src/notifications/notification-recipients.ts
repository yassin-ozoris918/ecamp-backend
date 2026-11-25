import { Injectable } from '@nestjs/common';
import { CourseStatus, CourseType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationKind } from './notification.constants';
import { isOwnLectureAccess } from '../common/lecture-lock.policy';

/**
 * WHO gets a notification.
 *
 * Rule of thumb: a student is notified about an item if, and only if, the platform would let them
 * open that item right now. The rules below mirror the real access checks:
 *   - videos   → LecturesService.startAccess / getSecureStreamToken
 *   - files    → AttachmentsService.hasFileAccess
 *   - course visibility/targeting → CoursesService.getCoursesForStudent
 * If you change one of those checks, change the matching rule here and its unit test.
 */

const TARGET_FIELDS = [
  'targetHighSchoolSystem',
  'targetStudyMode',
  'targetStudyLanguage',
  'targetHighSchoolGrade',
  'targetTraditionalBranch',
  'targetBaccalaureatePath',
  'targetUniversityId',
  'targetFacultyId',
  'targetDepartmentId',
  'targetProgramId',
] as const;
type TargetField = (typeof TARGET_FIELDS)[number];
type Targeting = Partial<Record<TargetField, string | null>>;

export const STUDENT_SELECT = {
  id: true,
  role: true,
  isActive: true,
  isDemo: true,
  deletedAt: true,
  educationLevel: true,
  highSchoolSystem: true,
  studyMode: true,
  studyLanguage: true,
  highSchoolGrade: true,
  traditionalBranch: true,
  baccalaureatePath: true,
  universityId: true,
  facultyId: true,
  departmentId: true,
  programId: true,
} as const;

export interface RecipientStudent {
  id: string;
  role: string;
  isActive: boolean;
  isDemo: boolean;
  deletedAt: Date | null;
  educationLevel: string;
  highSchoolSystem: string | null;
  studyMode: string | null;
  studyLanguage: string | null;
  highSchoolGrade: string | null;
  traditionalBranch: string | null;
  baccalaureatePath: string | null;
  universityId: string | null;
  facultyId: string | null;
  departmentId: string | null;
  programId: string | null;
}

export interface RecipientCourse extends Targeting {
  id: string;
  type: string;
  status: string;
  isFree: boolean;
  audienceType: string;
  targetGroups: Targeting[];
}

export interface AccessSources {
  /** StudentCourseAccess rows of this course (full-course code). */
  courseAccess: { studentId: string; expiresAt: Date | null; student: RecipientStudent }[];
  /** StudentLectureAccess rows of THIS lecture (lecture code, or created when a course student started it). */
  lectureAccess: { studentId: string; isStarted: boolean; expiresAt: Date | null; source?: string; student: RecipientStudent }[];
  /** StudentLectureAccess rows of ANY lecture in the course — only used for free courses. */
  freeCourseLectureAccess: { studentId: string; student: RecipientStudent }[];
  /** StudentFileAccess rows with courseId = this course (COURSE_FILES / materials code). */
  courseFilesAccess: { studentId: string; student: RecipientStudent }[];
}

/** Same predicate as CoursesService.getStudentTargetingCondition, evaluated in memory. */
function matchesTargeting(t: Targeting, s: RecipientStudent, highSchool: boolean): boolean {
  const eq = (target: string | null | undefined, value: string | null) => target == null || target === value;
  if (highSchool) {
    return (
      eq(t.targetHighSchoolSystem, s.highSchoolSystem) &&
      eq(t.targetStudyMode, s.studyMode) &&
      eq(t.targetStudyLanguage, s.studyLanguage) &&
      eq(t.targetHighSchoolGrade, s.highSchoolGrade) &&
      eq(t.targetTraditionalBranch, s.traditionalBranch) &&
      eq(t.targetBaccalaureatePath, s.baccalaureatePath)
    );
  }
  return (
    eq(t.targetUniversityId, s.universityId) &&
    eq(t.targetFacultyId, s.facultyId) &&
    eq(t.targetDepartmentId, s.departmentId) &&
    eq(t.targetProgramId, s.programId)
  );
}

/** True when the student is a real, active student who can currently see this course at all. */
export function isStudentEligibleForCourse(course: RecipientCourse, s: RecipientStudent): boolean {
  if (s.role !== Role.STUDENT || !s.isActive || s.deletedAt || s.isDemo) return false;
  if (course.status !== CourseStatus.PUBLISHED) return false;
  if (course.audienceType !== s.educationLevel) return false;
  const highSchool = s.educationLevel === 'HIGH_SCHOOL';
  if (course.targetGroups.length === 0) return matchesTargeting(course, s, highSchool);
  return course.targetGroups.some((g) => matchesTargeting(g, s, highSchool));
}

const notExpired = (expiresAt: Date | null, now: Date) => !expiresAt || expiresAt.getTime() > now.getTime();

/**
 * Pure decision function (no DB) — returns userId → in-app link for every student to notify.
 */
export function decideRecipients(
  kind: NotificationKind,
  courseIn: RecipientCourse,
  lectureId: string,
  srcIn: AccessSources,
  now: Date = new Date(),
  lectureLocked = false,
): Map<string, string> {
  const out = new Map<string, string>();
  // Locked lecture (see common/lecture-lock.policy): only students who own THIS lecture — through a
  // lecture code, an admin grant or a demo account — can open it. Course, free-course and
  // course-files access do not count.
  const course = lectureLocked ? { ...courseIn, isFree: false } : courseIn;
  const src: AccessSources = lectureLocked
    ? {
        courseAccess: [],
        lectureAccess: srcIn.lectureAccess.filter((r) => isOwnLectureAccess(r)),
        freeCourseLectureAccess: [],
        courseFilesAccess: [],
      }
    : srcIn;
  const lectureLink = `/lecture/${lectureId}`;
  const filesLink = '/files';
  const students = new Map<string, RecipientStudent>();
  const remember = (s: RecipientStudent) => students.set(s.id, s);

  const lectureRow = new Map(src.lectureAccess.map((r) => [r.studentId, r]));
  const courseRow = new Map(src.courseAccess.map((r) => [r.studentId, r]));
  src.lectureAccess.forEach((r) => remember(r.student));
  src.courseAccess.forEach((r) => remember(r.student));

  /** Can this student play the videos of THIS lecture right now? */
  const canWatchLecture = (studentId: string): boolean => {
    if (course.type !== CourseType.NORMAL) return false; // materials-only courses have no videos for students
    const la = lectureRow.get(studentId);
    const ca = courseRow.get(studentId);
    if (course.isFree) return true; // free course: no timers, no codes (caller only passes enrolled students)
    if (la) return !la.isStarted || notExpired(la.expiresAt, now); // lecture timer decides once it exists
    return !!ca && notExpired(ca.expiresAt, now); // course student who has not opened this lecture yet
  };

  if (kind === 'VIDEO') {
    if (course.type !== CourseType.NORMAL) return out;
    const candidates = new Set<string>([...lectureRow.keys(), ...courseRow.keys()]);
    if (course.isFree) {
      src.freeCourseLectureAccess.forEach((r) => {
        remember(r.student);
        candidates.add(r.studentId);
      });
    }
    for (const id of candidates) {
      const s = students.get(id);
      if (s && isStudentEligibleForCourse(course, s) && canWatchLecture(id)) out.set(id, lectureLink);
    }
    return out;
  }

  // MATERIAL — mirrors AttachmentsService.hasFileAccess: lecture access OR course access OR course-files access.
  src.courseFilesAccess.forEach((r) => remember(r.student));
  const candidates = new Set<string>([
    ...lectureRow.keys(),
    ...courseRow.keys(),
    ...src.courseFilesAccess.map((r) => r.studentId),
  ]);
  for (const id of candidates) {
    const s = students.get(id);
    if (!s || !isStudentEligibleForCourse(course, s)) continue;
    // Send them where they can actually open it: the lecture page if they can enter it, otherwise "My Files".
    out.set(id, canWatchLecture(id) ? lectureLink : filesLink);
  }
  return out;
}

const COURSE_SELECT = {
  id: true,
  title: true,
  type: true,
  status: true,
  isFree: true,
  deletedAt: true,
  audienceType: true,
  targetHighSchoolSystem: true,
  targetStudyMode: true,
  targetStudyLanguage: true,
  targetHighSchoolGrade: true,
  targetTraditionalBranch: true,
  targetBaccalaureatePath: true,
  targetUniversityId: true,
  targetFacultyId: true,
  targetDepartmentId: true,
  targetProgramId: true,
  targetGroups: {
    select: {
      targetHighSchoolSystem: true,
      targetStudyMode: true,
      targetStudyLanguage: true,
      targetHighSchoolGrade: true,
      targetTraditionalBranch: true,
      targetBaccalaureatePath: true,
      targetUniversityId: true,
      targetFacultyId: true,
      targetDepartmentId: true,
      targetProgramId: true,
    },
  },
} as const;

@Injectable()
export class NotificationRecipientsService {
  constructor(private prisma: PrismaService) {}

  loadLectureContext(lectureId: string) {
    return this.prisma.lecture.findUnique({
      where: { id: lectureId },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        requiresOwnCode: true,
        chapter: { select: { title: true } },
        course: { select: COURSE_SELECT },
      },
    });
  }

  async resolve(kind: NotificationKind, course: RecipientCourse, lectureId: string, now = new Date(), lectureLocked = false) {
    const student = { select: STUDENT_SELECT };
    const [courseAccess, lectureAccess, freeCourseLectureAccess, courseFilesAccess] = await Promise.all([
      this.prisma.studentCourseAccess.findMany({
        where: { courseId: course.id, deletedAt: null },
        select: { studentId: true, expiresAt: true, student },
      }),
      this.prisma.studentLectureAccess.findMany({
        where: { lectureId, deletedAt: null },
        select: { studentId: true, isStarted: true, expiresAt: true, source: true, student },
      }),
      kind === 'VIDEO' && course.isFree
        ? this.prisma.studentLectureAccess.findMany({
            where: { lecture: { courseId: course.id }, deletedAt: null },
            distinct: ['studentId'],
            select: { studentId: true, student },
          })
        : Promise.resolve([]),
      kind === 'MATERIAL'
        ? this.prisma.studentFileAccess.findMany({
            where: { courseId: course.id, deletedAt: null },
            distinct: ['studentId'],
            select: { studentId: true, student },
          })
        : Promise.resolve([]),
    ]);

    return decideRecipients(
      kind,
      course,
      lectureId,
      { courseAccess, lectureAccess, freeCourseLectureAccess, courseFilesAccess },
      now,
      lectureLocked,
    );
  }
}
