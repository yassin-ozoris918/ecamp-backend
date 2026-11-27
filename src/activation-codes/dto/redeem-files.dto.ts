import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Files page code box: give the course (course-wide box) or the file (a file's own box). */
export class RedeemFilesDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  code: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;

  /** The student agreed to use the code the way the server suggested (see the CONFIRM_* answers). */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
