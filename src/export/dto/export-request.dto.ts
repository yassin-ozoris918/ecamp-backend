import { IsNotEmpty, IsString, IsIn, IsOptional, IsObject } from 'class-validator';

export class ExportRequestDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['users', 'courses', 'lectures', 'quiz-attempts', 'exam-attempts', 'activation-codes', 'audit-logs', 'progress'])
  entity: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['xlsx', 'csv', 'json', 'pdf'])
  format: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;
}
