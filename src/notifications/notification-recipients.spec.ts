import { decideRecipients, isStudentEligibleForCourse, AccessSources, RecipientCourse, RecipientStudent } from './notification-recipients';

const NOW = new Date('2026-11-23T12:00:00Z');
const PAST = new Date('2026-11-01T00:00:00Z');
const FUTURE = new Date('2026-12-31T00:00:00Z');
const L = 'lecture-1';

function student(id: string, over: Partial<RecipientStudent> = {}): RecipientStudent {
  return {
    id,
    role: 'STUDENT',
    isActive: true,
    isDemo: false,
    deletedAt: null,
    educationLevel: 'UNIVERSITY',
    highSchoolSystem: null,
    studyMode: null,
    studyLanguage: null,
    highSchoolGrade: null,
    traditionalBranch: null,
    baccalaureatePath: null,
    universityId: 'uni-1',
    facultyId: 'fac-1',
    departmentId: null,
    programId: null,
    ...over,
  };
}

function course(over: Partial<RecipientCourse> = {}): RecipientCourse {
  return { id: 'course-1', type: 'NORMAL', status: 'PUBLISHED', isFree: false, audienceType: 'UNIVERSITY', targetGroups: [], ...over };
}

function sources(over: Partial<AccessSources> = {}): AccessSources {
  return { courseAccess: [], lectureAccess: [], freeCourseLectureAccess: [], courseFilesAccess: [], ...over };
}

const ca = (s: RecipientStudent, expiresAt: Date | null = null) => ({ studentId: s.id, expiresAt, student: s });
const la = (s: RecipientStudent, isStarted = false, expiresAt: Date | null = null, source = 'CODE') => ({ studentId: s.id, isStarted, expiresAt, source, student: s });
const fa = (s: RecipientStudent) => ({ studentId: s.id, student: s });

describe('decideRecipients — videos (new lecture / new session)', () => {
  it('notifies full-course students and links to the lecture', () => {
    const a = student('a');
    const r = decideRecipients('VIDEO', course(), L, sources({ courseAccess: [ca(a)] }), NOW);
    expect([...r]).toEqual([['a', `/lecture/${L}`]]);
  });

  it('does NOT notify materials-only (course files) students about videos', () => {
    const m = student('m');
    const r = decideRecipients('VIDEO', course(), L, sources({ courseFilesAccess: [fa(m)] }), NOW);
    expect(r.size).toBe(0);
  });

  it('notifies a lecture-code student only for their own lecture', () => {
    const b = student('b');
    expect(decideRecipients('VIDEO', course(), L, sources({ lectureAccess: [la(b)] }), NOW).has('b')).toBe(true);
    // A lecture-code student has no row for another lecture → not a recipient
    expect(decideRecipients('VIDEO', course(), 'other', sources(), NOW).size).toBe(0);
  });

  it('skips students whose course access has expired', () => {
    const a = student('a');
    expect(decideRecipients('VIDEO', course(), L, sources({ courseAccess: [ca(a, PAST)] }), NOW).size).toBe(0);
    expect(decideRecipients('VIDEO', course(), L, sources({ courseAccess: [ca(a, FUTURE)] }), NOW).size).toBe(1);
  });

  it('skips a course student whose timer for THIS lecture already ran out', () => {
    const a = student('a');
    const r = decideRecipients('VIDEO', course(), L, sources({ courseAccess: [ca(a)], lectureAccess: [la(a, true, PAST)] }), NOW);
    expect(r.size).toBe(0);
  });

  it('keeps a lecture-code student whose timer has not started yet', () => {
    const b = student('b');
    expect(decideRecipients('VIDEO', course(), L, sources({ lectureAccess: [la(b, false, null)] }), NOW).size).toBe(1);
  });

  it('free course: notifies students who opened any lecture of the course, ignoring timers', () => {
    const f = student('f');
    const r = decideRecipients('VIDEO', course({ isFree: true }), L, sources({ freeCourseLectureAccess: [fa(f)] }), NOW);
    expect(r.get('f')).toBe(`/lecture/${L}`);
  });

  it('never sends video notifications for a materials-only course', () => {
    const a = student('a');
    expect(decideRecipients('VIDEO', course({ type: 'MATERIALS_ONLY' }), L, sources({ courseAccess: [ca(a)] }), NOW).size).toBe(0);
  });

  it('de-duplicates a student who has both course and lecture access', () => {
    const a = student('a');
    const r = decideRecipients('VIDEO', course(), L, sources({ courseAccess: [ca(a)], lectureAccess: [la(a, true, FUTURE)] }), NOW);
    expect(r.size).toBe(1);
  });
});

describe('decideRecipients — materials (handouts / notes)', () => {
  it('notifies course, lecture and course-files students', () => {
    const a = student('a');
    const b = student('b');
    const m = student('m');
    const r = decideRecipients(
      'MATERIAL',
      course(),
      L,
      sources({ courseAccess: [ca(a)], lectureAccess: [la(b)], courseFilesAccess: [fa(m)] }),
      NOW,
    );
    expect(r.get('a')).toBe(`/lecture/${L}`);
    expect(r.get('b')).toBe(`/lecture/${L}`);
    expect(r.get('m')).toBe('/files'); // materials-only students go to "My Files"
  });

  it('materials-only course: everyone is sent to My Files', () => {
    const m = student('m');
    const r = decideRecipients('MATERIAL', course({ type: 'MATERIALS_ONLY' }), L, sources({ courseFilesAccess: [fa(m)] }), NOW);
    expect(r.get('m')).toBe('/files');
  });

  it('expired full-course students still get file notifications (file access does not expire) but link to My Files', () => {
    const a = student('a');
    const r = decideRecipients('MATERIAL', course(), L, sources({ courseAccess: [ca(a, PAST)] }), NOW);
    expect(r.get('a')).toBe('/files');
  });

  it('single-file code holders are not notified about other files', () => {
    // FILE-code access rows are per attachment and are never passed as a course source.
    expect(decideRecipients('MATERIAL', course(), L, sources(), NOW).size).toBe(0);
  });
});

describe('eligibility filters', () => {
  it('excludes inactive, deleted, demo and non-student users', () => {
    const c = course();
    expect(isStudentEligibleForCourse(c, student('x', { isActive: false }))).toBe(false);
    expect(isStudentEligibleForCourse(c, student('x', { deletedAt: PAST }))).toBe(false);
    expect(isStudentEligibleForCourse(c, student('x', { isDemo: true }))).toBe(false);
    expect(isStudentEligibleForCourse(c, student('x', { role: 'INSTRUCTOR' }))).toBe(false);
  });

  it('excludes everyone while the course is a draft', () => {
    const a = student('a');
    expect(decideRecipients('VIDEO', course({ status: 'DRAFT' }), L, sources({ courseAccess: [ca(a)] }), NOW).size).toBe(0);
  });

  it('respects audience and targeting (same rule as the course catalog)', () => {
    expect(isStudentEligibleForCourse(course({ audienceType: 'HIGH_SCHOOL' }), student('a'))).toBe(false);
    expect(isStudentEligibleForCourse(course({ targetUniversityId: 'uni-1' }), student('a'))).toBe(true);
    expect(isStudentEligibleForCourse(course({ targetUniversityId: 'uni-2' }), student('a'))).toBe(false);
    // Target groups: matching any group is enough
    const grouped = course({ targetGroups: [{ targetUniversityId: 'uni-2' }, { targetFacultyId: 'fac-1' }] });
    expect(isStudentEligibleForCourse(grouped, student('a'))).toBe(true);
    const noMatch = course({ targetGroups: [{ targetUniversityId: 'uni-2' }] });
    expect(isStudentEligibleForCourse(noMatch, student('a'))).toBe(false);
  });

  it('high-school targeting uses the high-school dimensions', () => {
    const hs = student('h', { educationLevel: 'HIGH_SCHOOL', highSchoolGrade: 'GRADE_12' });
    const c = course({ audienceType: 'HIGH_SCHOOL', targetHighSchoolGrade: 'GRADE_12' });
    expect(isStudentEligibleForCourse(c, hs)).toBe(true);
    expect(isStudentEligibleForCourse({ ...c, targetHighSchoolGrade: 'GRADE_11' }, hs)).toBe(false);
  });
});

describe('decideRecipients — locked lecture (needs its own code)', () => {
  it('videos: only students who own the lecture (code / admin) are notified', () => {
    const full = student('full');
    const buyer = student('buyer');
    const viaCourse = student('viaCourse');
    const admin = student('admin');
    const r = decideRecipients(
      'VIDEO',
      course(),
      L,
      sources({
        courseAccess: [ca(full), ca(viaCourse)],
        lectureAccess: [la(buyer, false, null, 'CODE'), la(viaCourse, true, FUTURE, 'COURSE'), la(admin, false, null, 'ADMIN')],
      }),
      NOW,
      true,
    );
    expect([...r.keys()].sort()).toEqual(['admin', 'buyer']);
  });

  it('files: course-files (materials) and full-course students are not notified', () => {
    const m = student('m');
    const full = student('full');
    const buyer = student('buyer');
    const r = decideRecipients(
      'MATERIAL',
      course(),
      L,
      sources({ courseAccess: [ca(full)], courseFilesAccess: [fa(m)], lectureAccess: [la(buyer)] }),
      NOW,
      true,
    );
    expect([...r]).toEqual([['buyer', `/lecture/${L}`]]);
  });

  it('free course: a locked lecture still needs its own code', () => {
    const f = student('f');
    const r = decideRecipients('VIDEO', course({ isFree: true }), L, sources({ freeCourseLectureAccess: [fa(f)] }), NOW, true);
    expect(r.size).toBe(0);
  });
});
