import { IsBoolean, ValidateIf } from 'class-validator';

export class UpdateAttachmentDownloadDto {
  /** true = downloadable, false = view only, null = inherit from course. */
  @ValidateIf((_o, v) => v !== null)
  @IsBoolean()
  allowDownload: boolean | null;
}
