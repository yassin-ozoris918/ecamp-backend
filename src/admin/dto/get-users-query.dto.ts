import { IsOptional, IsString, IsEnum, IsBoolean, IsIn, IsInt, Min, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Role, EducationLevel, HighSchoolSystem, StudyMode, StudyLanguage, HighSchoolGrade, TraditionalBranch, BaccalaureatePath } from '@prisma/client';

export class GetUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @IsOptional()
  @IsEnum(HighSchoolSystem)
  highSchoolSystem?: HighSchoolSystem;

  @IsOptional()
  @IsEnum(StudyMode)
  studyMode?: StudyMode;

  @IsOptional()
  @IsEnum(StudyLanguage)
  studyLanguage?: StudyLanguage;

  @IsOptional()
  @IsEnum(HighSchoolGrade)
  highSchoolGrade?: HighSchoolGrade;

  @IsOptional()
  @IsEnum(TraditionalBranch)
  traditionalBranch?: TraditionalBranch;

  @IsOptional()
  @IsEnum(BaccalaureatePath)
  baccalaureatePath?: BaccalaureatePath;

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'fullName', 'email', 'role', 'educationLevel'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;
}
