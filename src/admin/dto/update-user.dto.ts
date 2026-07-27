import { IsBoolean, IsEnum, IsOptional, IsString, IsEmail } from 'class-validator';
import { Role, EducationLevel } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @IsOptional()
  @IsString()
  deviceId?: string | null;
}
