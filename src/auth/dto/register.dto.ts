import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsString,
  ValidateIf,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';
import { EducationLevel } from '@prisma/client';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsEnum(EducationLevel)
  educationLevel: EducationLevel;

  @IsOptional()
  @IsString()
  @Matches(/^01[0125][0-9]{8}$/, {
    message: 'Invalid Egyptian phone number format',
  })
  phoneNumber?: string;

  // If the user selects HIGH_SCHOOL, this field becomes mandatory.
  @ValidateIf(
    (o: RegisterDto) => o.educationLevel === EducationLevel.HIGH_SCHOOL,
  )
  @IsString()
  @IsNotEmpty({
    message: 'Parent phone number is required for High School students.',
  })
  @Matches(/^01[0125][0-9]{8}$/, {
    message: 'Invalid Egyptian parent phone number format',
  })
  parentPhoneNumber?: string;

  @IsOptional()
  @IsString()
  profilePictureUrl?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
