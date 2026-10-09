import { IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { VideoSourceType, HighSchoolSystem, StudyMode, StudyLanguage, HighSchoolGrade, TraditionalBranch, BaccalaureatePath } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  titleAr: string;

  @IsString()
  titleEn: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class TargetGroupDto {
  @IsEnum(HighSchoolSystem)
  @IsOptional()
  targetHighSchoolSystem?: HighSchoolSystem;

  @IsEnum(StudyMode)
  @IsOptional()
  targetStudyMode?: StudyMode;

  @IsEnum(StudyLanguage)
  @IsOptional()
  targetStudyLanguage?: StudyLanguage;

  @IsEnum(HighSchoolGrade)
  @IsOptional()
  targetHighSchoolGrade?: HighSchoolGrade;

  @IsEnum(TraditionalBranch)
  @IsOptional()
  targetTraditionalBranch?: TraditionalBranch;

  @IsEnum(BaccalaureatePath)
  @IsOptional()
  targetBaccalaureatePath?: BaccalaureatePath;

  @IsUUID()
  @IsOptional()
  targetUniversityId?: string;

  @IsUUID()
  @IsOptional()
  targetFacultyId?: string;

  @IsUUID()
  @IsOptional()
  targetDepartmentId?: string;

  @IsUUID()
  @IsOptional()
  targetProgramId?: string;
}

export class CreateTutorialDto {
  @IsString()
  titleAr: string;

  @IsString()
  titleEn: string;

  @IsString()
  @IsOptional()
  descriptionAr?: string;

  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @IsEnum(VideoSourceType)
  sourceType: VideoSourceType;

  @IsString()
  @IsOptional()
  cloudflareId?: string;

  @IsString()
  @IsOptional()
  externalUrl?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsUUID()
  categoryId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TargetGroupDto)
  @IsOptional()
  targetGroups?: TargetGroupDto[];
}

export class UpdateTutorialDto extends PartialType(CreateTutorialDto) {}
