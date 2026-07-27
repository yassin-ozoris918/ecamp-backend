import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';

export class CreateChapterAttachmentDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsUUID()
  chapterId: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  file?: any;
}
