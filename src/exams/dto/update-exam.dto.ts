import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;
}
