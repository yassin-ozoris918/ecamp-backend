import { IsEmail, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  /** Trusted-device details: hardware signals + a signature from this browser's private key. */
  @IsOptional()
  @IsObject()
  device?: Record<string, any>;
}
