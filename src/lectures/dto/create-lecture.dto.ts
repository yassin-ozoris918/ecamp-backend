import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  IsInt,
} from 'class-validator';

export class CreateLectureDto {
  @IsNotEmpty()
  @IsString()
  courseId: string;

  @IsOptional()
  @IsString()
  chapterId?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  warningHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  warningMinutes?: number;

  /**
   * Optional maximum number of views per video session.
   * null or omitted = unlimited.
   * Must be a positive integer (>= 1) when provided.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxViews?: number | null;
}
