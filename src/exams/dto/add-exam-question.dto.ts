import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

class ExamAnswerDto {
  @IsNotEmpty()
  @IsString()
  text: string;

  @IsNotEmpty()
  @IsBoolean()
  isCorrect: boolean;
}

export class AddExamQuestionDto {
  @IsNotEmpty()
  @IsString()
  examId: string;

  @IsNotEmpty()
  @IsString()
  text: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsOptional()
  @IsNumber()
  @Min(1)
  points?: number;

  // Answers are only required if the type is MCQ or True/False
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExamAnswerDto)
  answers?: ExamAnswerDto[];
}
