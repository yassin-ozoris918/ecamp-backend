import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class ExamResponseDto {
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @IsOptional()
  @IsNumber()
  selectedOptionIndex?: number; // For MCQ / True-False

  @IsOptional()
  @IsString()
  textResponse?: string; // For Short Answer / Essay
}

export class SubmitExamDto {
  @IsNotEmpty()
  @IsString()
  examId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamResponseDto)
  responses: ExamResponseDto[];
}
