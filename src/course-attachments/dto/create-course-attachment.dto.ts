import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';

export class CreateCourseAttachmentDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsUUID()
  courseId: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  file?: any;
}
