import { IsNotEmpty, IsString, IsUUID, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { AttachmentType } from '@prisma/client';

// Multipart form fields arrive as strings: 'true' | 'false' | 'inherit' (or empty) => true | false | null
export const toNullableBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
};

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

  /** true/false = explicit override of the course policy; null/omitted = inherit from the course. */
  @IsOptional()
  @Transform(toNullableBoolean)
  @IsBoolean()
  allowDownload?: boolean | null;

  @IsOptional()
  file?: any;
}
