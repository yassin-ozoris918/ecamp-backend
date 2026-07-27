import { IsNotEmpty, IsString, IsNumber, Min, IsOptional, IsArray, IsEnum } from 'class-validator';
import { QuestionType } from '@prisma/client';

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

  @IsArray()
  @IsString({ each: true })
  options: string[];

  @IsNumber()
  @Min(0)
  correctOptionIndex: number;
}
