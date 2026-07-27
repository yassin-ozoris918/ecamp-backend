import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateExamDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // An exam must belong to either a Course OR a Lecture
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  chapterId?: string;

  @IsOptional()
  @IsString()
  lectureId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeLimit?: number; // In minutes

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;
}
