import { normalizeEducationProfile } from './segmentation-validation.util';
import { EducationLevel } from '@prisma/client';

describe('normalizeEducationProfile', () => {
  it('should clear high school fields when educationLevel is UNIVERSITY', () => {
    const state = {
      educationLevel: EducationLevel.UNIVERSITY,
      highSchoolSystem: 'TRADITIONAL',
      studyMode: 'ONLINE',
      studyLanguage: 'ARABIC',
      highSchoolGrade: 'GRADE_3',
      traditionalBranch: 'SCIENCE',
      baccalaureatePath: 'BUSINESS',
      parentPhoneNumber: '01012345678',
      universityId: 'uni-1',
    };

    normalizeEducationProfile(state);

    expect(state.highSchoolSystem).toBeNull();
    expect(state.studyMode).toBeNull();
    expect(state.studyLanguage).toBeNull();
    expect(state.highSchoolGrade).toBeNull();
    expect(state.traditionalBranch).toBeNull();
    expect(state.baccalaureatePath).toBeNull();
    expect(state.parentPhoneNumber).toBeNull();
    expect(state.universityId).toBe('uni-1');
  });

  it('should clear university fields when educationLevel is HIGH_SCHOOL', () => {
    const state = {
      educationLevel: EducationLevel.HIGH_SCHOOL,
      highSchoolSystem: 'TRADITIONAL',
      universityId: 'uni-1',
      facultyId: 'fac-1',
      departmentId: 'dep-1',
      programId: 'prog-1',
      otherUniversityName: 'Other Uni',
      otherFacultyName: 'Other Fac',
      otherDepartmentName: 'Other Dep',
      otherProgramName: 'Other Prog',
    };

    normalizeEducationProfile(state);

    expect(state.highSchoolSystem).toBe('TRADITIONAL');
    expect(state.universityId).toBeNull();
    expect(state.facultyId).toBeNull();
    expect(state.departmentId).toBeNull();
    expect(state.programId).toBeNull();
    expect(state.otherUniversityName).toBeNull();
    expect(state.otherFacultyName).toBeNull();
    expect(state.otherDepartmentName).toBeNull();
    expect(state.otherProgramName).toBeNull();
  });
});
