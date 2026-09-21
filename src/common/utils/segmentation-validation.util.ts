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

  universityId?: string | null;
  facultyId?: string | null;
  departmentId?: string | null;
  programId?: string | null;
  otherUniversityName?: string | null;
  otherFacultyName?: string | null;
  otherDepartmentName?: string | null;
  otherProgramName?: string | null;

  targetUniversityId?: string | null;
  targetFacultyId?: string | null;
  targetDepartmentId?: string | null;
  targetProgramId?: string | null;
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

export async function validateUniversitySegmentation(prisma: any, state: StudentSegmentationState): Promise<void> {
  if (state.educationLevel !== EducationLevel.UNIVERSITY) return;

  // Rule 5: Hierarchy completeness
  if (state.programId && !state.departmentId && !state.facultyId) {
    // Wait, flat faculty allows program with no department. So we only require facultyId if departmentId is missing.
    if (!state.facultyId) throw new BadRequestException('Faculty is required when Program is provided');
  }
  if (state.departmentId && !state.facultyId) throw new BadRequestException('Faculty is required when Department is provided');
  if (state.facultyId && !state.universityId) throw new BadRequestException('University is required when Faculty is provided');

  if (state.universityId) {
    const uni = await prisma.academicUniversity.findUnique({ where: { id: state.universityId } });
    if (!uni) throw new BadRequestException('Invalid University ID');
    
    if (uni.isOther) {
      if (!state.otherUniversityName || state.otherUniversityName.trim() === '') {
        throw new BadRequestException('Other University Name is required');
      }
    } else {
      if (state.otherUniversityName && state.otherUniversityName.trim() !== '') {
        throw new BadRequestException('Other University Name is not allowed for known universities');
      }
    }
  }

  if (state.facultyId) {
    const fac = await prisma.academicFaculty.findUnique({ where: { id: state.facultyId } });
    if (!fac) throw new BadRequestException('Invalid Faculty ID');
    if (fac.universityId !== state.universityId) throw new BadRequestException('Faculty does not belong to the selected University');
    
    // As per FINAL DECISION 2: "When University = Other, subsequent academic levels become free-text."
    // "facultyId should be null" if university is Other.
    if (state.universityId) {
      const uni = await prisma.academicUniversity.findUnique({ where: { id: state.universityId } });
      if (uni && uni.isOther) throw new BadRequestException('Faculty ID must be null when University is Other');
    }

    if (fac.isOther) {
      if (!state.otherFacultyName || state.otherFacultyName.trim() === '') {
        throw new BadRequestException('Other Faculty Name is required');
      }
    } else {
      if (state.otherFacultyName && state.otherFacultyName.trim() !== '') {
        throw new BadRequestException('Other Faculty Name is not allowed for known faculties');
      }
    }
  }

  if (state.departmentId) {
    const dep = await prisma.academicDepartment.findUnique({ where: { id: state.departmentId } });
    if (!dep) throw new BadRequestException('Invalid Department ID');
    if (dep.facultyId !== state.facultyId) throw new BadRequestException('Department does not belong to the selected Faculty');

    if (dep.isOther) {
      if (!state.otherDepartmentName || state.otherDepartmentName.trim() === '') {
        throw new BadRequestException('Other Department Name is required');
      }
    } else {
      if (state.otherDepartmentName && state.otherDepartmentName.trim() !== '') {
        throw new BadRequestException('Other Department Name is not allowed for known departments');
      }
    }
  }

  if (state.programId) {
    const prog = await prisma.academicProgram.findUnique({ where: { id: state.programId } });
    if (!prog) throw new BadRequestException('Invalid Program ID');
    if (prog.facultyId !== state.facultyId) throw new BadRequestException('Program does not belong to the selected Faculty');
    if (state.departmentId && prog.departmentId !== state.departmentId) throw new BadRequestException('Program does not belong to the selected Department');

    if (prog.isOther) {
      if (!state.otherProgramName || state.otherProgramName.trim() === '') {
        throw new BadRequestException('Other Program Name is required');
      }
    } else {
      if (state.otherProgramName && state.otherProgramName.trim() !== '') {
        throw new BadRequestException('Other Program Name is not allowed for known programs');
      }
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

export async function validateCourseTargetingAsync(prisma: any, state: StudentSegmentationState): Promise<void> {
  validateCourseTargeting(state);

  // Prohibit targeting `isOther` entities
  if (state.targetUniversityId) {
    const uni = await prisma.academicUniversity.findUnique({ where: { id: state.targetUniversityId } });
    if (uni?.isOther) throw new BadRequestException('Cannot target an "Other" university directly.');
  }

  if (state.targetFacultyId) {
    const fac = await prisma.academicFaculty.findUnique({ where: { id: state.targetFacultyId } });
    if (fac?.isOther) throw new BadRequestException('Cannot target an "Other" faculty directly.');
    if (state.targetUniversityId && fac?.universityId !== state.targetUniversityId) {
      throw new BadRequestException('Target faculty does not belong to target university.');
    }
  }

  if (state.targetDepartmentId) {
    const dep = await prisma.academicDepartment.findUnique({ where: { id: state.targetDepartmentId } });
    if (dep?.isOther) throw new BadRequestException('Cannot target an "Other" department directly.');
    if (state.targetFacultyId && dep?.facultyId !== state.targetFacultyId) {
      throw new BadRequestException('Target department does not belong to target faculty.');
    }
  }

  if (state.targetProgramId) {
    const prog = await prisma.academicProgram.findUnique({ where: { id: state.targetProgramId } });
    if (prog?.isOther) throw new BadRequestException('Cannot target an "Other" program directly.');
    if (state.targetFacultyId && prog?.facultyId !== state.targetFacultyId) {
      throw new BadRequestException('Target program does not belong to target faculty.');
    }
    if (state.targetDepartmentId && prog?.departmentId !== state.targetDepartmentId) {
      throw new BadRequestException('Target program does not belong to target department.');
    }
  }
}
