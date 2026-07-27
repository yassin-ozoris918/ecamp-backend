import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
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
}
