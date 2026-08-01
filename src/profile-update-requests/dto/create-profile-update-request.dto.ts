import { IsOptional, IsString } from 'class-validator';

export class CreateProfileUpdateRequestDto {
  @IsOptional()
  @IsString()
  requestedFullName?: string;

  @IsOptional()
  @IsString()
  requestedPhoneNumber?: string;

  @IsOptional()
  @IsString()
  requestedParentPhone?: string;
}
