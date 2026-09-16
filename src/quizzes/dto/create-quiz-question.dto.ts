import { IsNotEmpty, IsString, IsInt, IsUUID, IsArray, Min, IsOptional, IsEnum } from 'class-validator';
import { QuizQuestionVersion } from '@prisma/client';

export class CreateQuizQuestionDto {
  @IsNotEmpty()
  @IsUUID()
  quizId: string;

  @IsNotEmpty()
  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
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

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  points: number;

  @IsOptional()
  @IsEnum(QuizQuestionVersion)
  version?: QuizQuestionVersion;
}
