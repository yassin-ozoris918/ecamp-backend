import { IsNotEmpty, IsOptional, IsString, IsEnum, IsBoolean, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { EducationLevel, HighSchoolSystem, StudyMode, StudyLanguage, HighSchoolGrade, TraditionalBranch, BaccalaureatePath, CourseType } from '@prisma/client';

export class CourseTargetGroupDto {
  @IsOptional()
  @IsEnum(HighSchoolSystem)
  targetHighSchoolSystem?: HighSchoolSystem | null;

  @IsOptional()
  @IsEnum(StudyMode)
  targetStudyMode?: StudyMode | null;

  @IsOptional()
  @IsEnum(StudyLanguage)
  targetStudyLanguage?: StudyLanguage | null;

  @IsOptional()
  @IsEnum(HighSchoolGrade)
  targetHighSchoolGrade?: HighSchoolGrade | null;

  @IsOptional()
  @IsEnum(TraditionalBranch)
  targetTraditionalBranch?: TraditionalBranch | null;

  @IsOptional()
  @IsEnum(BaccalaureatePath)
  targetBaccalaureatePath?: BaccalaureatePath | null;

  @IsOptional()
  @IsString()
  targetUniversityId?: string | null;

  @IsOptional()
  @IsString()
  targetFacultyId?: string | null;

  @IsOptional()
  @IsString()
  targetDepartmentId?: string | null;

  @IsOptional()
  @IsString()
  targetProgramId?: string | null;
}

export class CreateCourseDto {
  @IsEnum(EducationLevel)
  @IsNotEmpty()
  audienceType: EducationLevel;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsEnum(CourseType)
  type?: CourseType;

  @IsOptional()
  @IsEnum(HighSchoolSystem)
  targetHighSchoolSystem?: HighSchoolSystem | null;

  @IsOptional()
  @IsEnum(StudyMode)
  targetStudyMode?: StudyMode | null;

  @IsOptional()
  @IsEnum(StudyLanguage)
  targetStudyLanguage?: StudyLanguage | null;

  @IsOptional()
  @IsEnum(HighSchoolGrade)
  targetHighSchoolGrade?: HighSchoolGrade | null;

  @IsOptional()
  @IsEnum(TraditionalBranch)
  targetTraditionalBranch?: TraditionalBranch | null;

  @IsOptional()
  @IsEnum(BaccalaureatePath)
  targetBaccalaureatePath?: BaccalaureatePath | null;

  @IsOptional()
  @IsString()
  targetUniversityId?: string | null;

  @IsOptional()
  @IsString()
  targetFacultyId?: string | null;

  @IsOptional()
  @IsString()
  targetDepartmentId?: string | null;

  @IsOptional()
  @IsString()
  targetProgramId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseTargetGroupDto)
  targetGroups?: CourseTargetGroupDto[];
}
