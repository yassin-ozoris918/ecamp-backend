import { courseLevelAccessApplies, effectiveLectureAccess, isOwnLectureAccess } from './lecture-lock.policy';

describe('lecture lock policy', () => {
  const locked = { requiresOwnCode: true };
  const open = { requiresOwnCode: false };

  it('normal lectures: any access row applies and course-level access applies', () => {
    for (const source of ['CODE', 'COURSE', 'FREE', 'ADMIN', 'DEMO']) {
      expect(effectiveLectureAccess(open, { source })).toEqual({ source });
    }
    expect(courseLevelAccessApplies(open)).toBe(true);
    expect(courseLevelAccessApplies(null)).toBe(true);
  });

  it('locked lectures: only code / admin / demo access applies; course-level access never does', () => {
    expect(effectiveLectureAccess(locked, { source: 'CODE' })).toEqual({ source: 'CODE' });
    expect(effectiveLectureAccess(locked, { source: 'ADMIN' })).toEqual({ source: 'ADMIN' });
    expect(effectiveLectureAccess(locked, { source: 'DEMO' })).toEqual({ source: 'DEMO' });
    expect(effectiveLectureAccess(locked, { source: 'COURSE' })).toBeNull();
    expect(effectiveLectureAccess(locked, { source: 'FREE' })).toBeNull();
    expect(effectiveLectureAccess(locked, null)).toBeNull();
    expect(courseLevelAccessApplies(locked)).toBe(false);
  });

  it('unknown / missing sources are never treated as own access', () => {
    expect(isOwnLectureAccess({ source: undefined })).toBe(false);
    expect(isOwnLectureAccess({ source: 'SOMETHING' })).toBe(false);
    expect(isOwnLectureAccess(null)).toBe(false);
  });
});
