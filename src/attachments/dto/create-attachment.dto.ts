import { IsNotEmpty, IsString, IsUUID, IsOptional, IsEnum } from 'class-validator';
import { AttachmentType } from '@prisma/client';

export class CreateAttachmentDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsUUID()
  lectureId: string;

  @IsOptional()
  @IsEnum(AttachmentType)
  type?: AttachmentType;

  @IsOptional()
  file?: any;
}
