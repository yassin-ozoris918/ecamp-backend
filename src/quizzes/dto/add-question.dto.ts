import { IsNotEmpty, IsString, IsNumber, Min, IsOptional, IsArray, IsEnum } from 'class-validator';
import { QuestionType, QuizQuestionVersion } from '@prisma/client';

export class AddQuestionDto {
  @IsNotEmpty()
  @IsString()
  quizId: string;

  @IsNotEmpty()
  @IsString()
  text: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsNumber()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  correctOptionIndex?: number;

  @IsOptional()
  @IsString()
  referenceAnswer?: string;

  @IsOptional()
  @IsArray()
  matchOptions?: any[]; // [{left: string, right: string}]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  correctOrder?: string[];

  @IsOptional()
  @IsEnum(QuizQuestionVersion)
  version?: QuizQuestionVersion;
}
