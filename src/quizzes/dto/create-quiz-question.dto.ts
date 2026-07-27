import { IsNotEmpty, IsString, IsInt, IsUUID, IsArray, Min } from 'class-validator';

export class CreateQuizQuestionDto {
  @IsNotEmpty()
  @IsUUID()
  quizId: string;

  @IsNotEmpty()
  @IsString()
  text: string;

  @IsArray()
  @IsString({ each: true })
  options: string[];

  @IsNotEmpty()
  @IsInt()
  @Min(0)
  correctOptionIndex: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  points: number;
}
