import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
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
}
