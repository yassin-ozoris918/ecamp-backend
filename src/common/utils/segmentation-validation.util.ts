import { BadRequestException } from '@nestjs/common';
import {
  EducationLevel,
  HighSchoolSystem,
  HighSchoolGrade,
  TraditionalBranch,
  BaccalaureatePath,
  StudyMode,
  StudyLanguage,
} from '@prisma/client';

export interface StudentSegmentationState {
  educationLevel?: EducationLevel | null;
  highSchoolSystem?: HighSchoolSystem | null;
  studyMode?: StudyMode | null;
  studyLanguage?: StudyLanguage | null;
  highSchoolGrade?: HighSchoolGrade | null;
  traditionalBranch?: TraditionalBranch | null;
  baccalaureatePath?: BaccalaureatePath | null;
}

export function validateStudentSegmentation(state: StudentSegmentationState): void {
  if (state.educationLevel === EducationLevel.HIGH_SCHOOL) {
    if (!state.highSchoolSystem) throw new BadRequestException('High School System is required');
    if (!state.studyMode) throw new BadRequestException('Study Mode is required');
    if (!state.studyLanguage) throw new BadRequestException('Study Language is required');
    if (!state.highSchoolGrade) throw new BadRequestException('High School Grade is required');

    if (state.highSchoolSystem === HighSchoolSystem.TRADITIONAL) {
      if (state.baccalaureatePath) throw new BadRequestException('Baccalaureate Path is forbidden for Traditional system');
      
      if (state.highSchoolGrade === HighSchoolGrade.GRADE_1) {
        if (state.traditionalBranch) throw new BadRequestException('Branch must be null for Traditional Grade 1');
      } else if (state.highSchoolGrade === HighSchoolGrade.GRADE_2) {
        if (!state.traditionalBranch) throw new BadRequestException('Branch is required for Traditional Grade 2');
        if (state.traditionalBranch !== TraditionalBranch.SCIENCE && state.traditionalBranch !== TraditionalBranch.LITERARY) {
          throw new BadRequestException('Invalid branch for Traditional Grade 2. Allowed: SCIENCE, LITERARY');
        }
      } else if (state.highSchoolGrade === HighSchoolGrade.GRADE_3) {
        if (!state.traditionalBranch) throw new BadRequestException('Branch is required for Traditional Grade 3');
        if (state.traditionalBranch !== TraditionalBranch.SCIENCE_BIOLOGY && 
            state.traditionalBranch !== TraditionalBranch.SCIENCE_MATH && 
            state.traditionalBranch !== TraditionalBranch.LITERARY) {
          throw new BadRequestException('Invalid branch for Traditional Grade 3. Allowed: SCIENCE_BIOLOGY, SCIENCE_MATH, LITERARY');
        }
      }
    } else if (state.highSchoolSystem === HighSchoolSystem.BACCALAUREATE) {
      if (state.traditionalBranch) throw new BadRequestException('Traditional Branch is forbidden for Baccalaureate system');
      
      if (state.highSchoolGrade === HighSchoolGrade.GRADE_1) {
        if (state.baccalaureatePath) throw new BadRequestException('Path must be null for Baccalaureate Grade 1');
      } else if (state.highSchoolGrade === HighSchoolGrade.GRADE_2 || state.highSchoolGrade === HighSchoolGrade.GRADE_3) {
        if (!state.baccalaureatePath) throw new BadRequestException(`Path is required for Baccalaureate ${state.highSchoolGrade}`);
        if (!Object.values(BaccalaureatePath).includes(state.baccalaureatePath)) {
          throw new BadRequestException('Invalid Baccalaureate Path');
        }
      }
    } else {
      throw new BadRequestException('Invalid High School System');
    }
  }
}

export function validateCourseTargeting(state: StudentSegmentationState): void {
  // NULL means wildcard, so fields are independently optional.
  // But if provided, they must not conflict logically.

  if (state.highSchoolSystem === HighSchoolSystem.TRADITIONAL) {
    if (state.baccalaureatePath) throw new BadRequestException('targetBaccalaureatePath must be null for TRADITIONAL system target');
  }

  if (state.highSchoolSystem === HighSchoolSystem.BACCALAUREATE) {
    if (state.traditionalBranch) throw new BadRequestException('targetTraditionalBranch must be null for BACCALAUREATE system target');
  }

  if (state.highSchoolGrade === HighSchoolGrade.GRADE_1) {
    if (state.traditionalBranch) throw new BadRequestException('targetTraditionalBranch must be null for GRADE_1 target');
    if (state.baccalaureatePath) throw new BadRequestException('targetBaccalaureatePath must be null for GRADE_1 target');
  }

  if (state.traditionalBranch) {
    if (state.highSchoolSystem === HighSchoolSystem.BACCALAUREATE) throw new BadRequestException('targetTraditionalBranch is incompatible with BACCALAUREATE');
    if (state.highSchoolGrade === HighSchoolGrade.GRADE_1) throw new BadRequestException('targetTraditionalBranch is incompatible with GRADE_1');
    if (state.highSchoolGrade === HighSchoolGrade.GRADE_2) {
      if (state.traditionalBranch !== TraditionalBranch.SCIENCE && state.traditionalBranch !== TraditionalBranch.LITERARY) {
        throw new BadRequestException('Invalid branch target for Traditional Grade 2');
      }
    }
    if (state.highSchoolGrade === HighSchoolGrade.GRADE_3) {
      if (state.traditionalBranch !== TraditionalBranch.SCIENCE_BIOLOGY && 
          state.traditionalBranch !== TraditionalBranch.SCIENCE_MATH && 
          state.traditionalBranch !== TraditionalBranch.LITERARY) {
        throw new BadRequestException('Invalid branch target for Traditional Grade 3');
      }
    }
  }

  if (state.baccalaureatePath) {
    if (state.highSchoolSystem === HighSchoolSystem.TRADITIONAL) throw new BadRequestException('targetBaccalaureatePath is incompatible with TRADITIONAL');
    if (state.highSchoolGrade === HighSchoolGrade.GRADE_1) throw new BadRequestException('targetBaccalaureatePath is incompatible with GRADE_1');
    if (!Object.values(BaccalaureatePath).includes(state.baccalaureatePath)) {
      throw new BadRequestException('Invalid targetBaccalaureatePath');
    }
  }
}
