import { IsNotEmpty, IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { EducationLevel } from '@prisma/client';

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
}
