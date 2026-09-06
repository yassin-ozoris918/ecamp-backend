import { validateStudentSegmentation, validateCourseTargeting, StudentSegmentationState } from './segmentation-validation.util';
import { EducationLevel, HighSchoolSystem, HighSchoolGrade, TraditionalBranch, BaccalaureatePath, StudyMode, StudyLanguage } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Segmentation Validation', () => {
  describe('Student Profile Validation', () => {
    
    const validBase: StudentSegmentationState = {
      educationLevel: EducationLevel.HIGH_SCHOOL,
      highSchoolSystem: HighSchoolSystem.TRADITIONAL,
      studyMode: StudyMode.ONLINE,
      studyLanguage: StudyLanguage.ARABIC,
      highSchoolGrade: HighSchoolGrade.GRADE_1,
      traditionalBranch: null,
      baccalaureatePath: null,
    };

    it('Traditional Grade 1 without branch -> PASS', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_1, traditionalBranch: null })).not.toThrow();
    });

    it('Traditional Grade 1 with branch -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_1, traditionalBranch: TraditionalBranch.SCIENCE })).toThrow(BadRequestException);
    });

    it('Traditional Grade 2 with valid branch -> PASS', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE })).not.toThrow();
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.LITERARY })).not.toThrow();
    });

    it('Traditional Grade 2 without branch -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: null })).toThrow(BadRequestException);
    });

    it('Traditional Grade 3 with valid branch (SCIENCE_BIOLOGY) -> PASS', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_3, traditionalBranch: TraditionalBranch.SCIENCE_BIOLOGY })).not.toThrow();
    });

    it('Traditional Grade 3 with valid branch (SCIENCE_MATH) -> PASS', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_3, traditionalBranch: TraditionalBranch.SCIENCE_MATH })).not.toThrow();
    });

    it('Traditional Grade 3 with invalid Grade-2 branch (SCIENCE) -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_3, traditionalBranch: TraditionalBranch.SCIENCE })).toThrow(BadRequestException);
    });

    it('Baccalaureate Grade 1 without path -> PASS', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolSystem: HighSchoolSystem.BACCALAUREATE, highSchoolGrade: HighSchoolGrade.GRADE_1, baccalaureatePath: null })).not.toThrow();
    });

    it('Baccalaureate Grade 1 with path -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolSystem: HighSchoolSystem.BACCALAUREATE, highSchoolGrade: HighSchoolGrade.GRADE_1, baccalaureatePath: BaccalaureatePath.BUSINESS })).toThrow(BadRequestException);
    });

    it('Baccalaureate Grade 2/3 with valid path -> PASS', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolSystem: HighSchoolSystem.BACCALAUREATE, highSchoolGrade: HighSchoolGrade.GRADE_2, baccalaureatePath: BaccalaureatePath.BUSINESS })).not.toThrow();
    });

    it('Baccalaureate Grade 2/3 without path -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolSystem: HighSchoolSystem.BACCALAUREATE, highSchoolGrade: HighSchoolGrade.GRADE_2, baccalaureatePath: null })).toThrow(BadRequestException);
    });

    it('Baccalaureate with TraditionalBranch -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolSystem: HighSchoolSystem.BACCALAUREATE, highSchoolGrade: HighSchoolGrade.GRADE_2, baccalaureatePath: BaccalaureatePath.BUSINESS, traditionalBranch: TraditionalBranch.SCIENCE })).toThrow(BadRequestException);
    });

    it('Traditional with BaccalaureatePath -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE, baccalaureatePath: BaccalaureatePath.BUSINESS })).toThrow(BadRequestException);
    });

    it('Missing required high-school base segmentation -> REJECT', () => {
      expect(() => validateStudentSegmentation({ ...validBase, studyMode: null })).toThrow(BadRequestException);
    });
  });

  describe('Course Targeting Validation', () => {
    it('NULL dimension -> wildcard allowed', () => {
      expect(() => validateCourseTargeting({ highSchoolSystem: null, highSchoolGrade: null })).not.toThrow();
    });

    it('Traditional system target blocks Baccalaureate path', () => {
      expect(() => validateCourseTargeting({ highSchoolSystem: HighSchoolSystem.TRADITIONAL, baccalaureatePath: BaccalaureatePath.BUSINESS })).toThrow(BadRequestException);
    });

    it('Baccalaureate system target blocks Traditional branch', () => {
      expect(() => validateCourseTargeting({ highSchoolSystem: HighSchoolSystem.BACCALAUREATE, traditionalBranch: TraditionalBranch.SCIENCE })).toThrow(BadRequestException);
    });

    it('Grade 1 target blocks specific branches', () => {
      expect(() => validateCourseTargeting({ highSchoolGrade: HighSchoolGrade.GRADE_1, traditionalBranch: TraditionalBranch.SCIENCE })).toThrow(BadRequestException);
    });

    it('Grade-specific invalid branches are rejected', () => {
      expect(() => validateCourseTargeting({ highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE_BIOLOGY })).toThrow(BadRequestException);
    });
  });
});
