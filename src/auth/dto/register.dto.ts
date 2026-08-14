import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsString,
  ValidateIf,
  IsOptional,
  IsEnum,
  Matches,
  MaxLength,
} from 'class-validator';
import { EducationLevel } from '@prisma/client';

export class RegisterDto {
  @IsNotEmpty({ message: 'auth.errors.nameRequired' })
  @IsString({ message: 'auth.errors.nameInvalid' })
  @MinLength(3, { message: 'auth.errors.nameTooShort' })
  @MaxLength(50, { message: 'auth.errors.nameTooLong' })
  fullName: string;

  @IsNotEmpty({ message: 'auth.errors.emailRequired' })
  @IsEmail({}, { message: 'auth.errors.invalidEmail' })
  email: string;

  @IsNotEmpty({ message: 'auth.errors.passwordRequired' })
  @IsString({ message: 'auth.errors.passwordInvalid' })
  @MinLength(8, { message: 'auth.errors.passwordTooShort' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+={}\[\]:;"'<>,.?/\\|-]{8,}$/, { message: 'auth.errors.passwordCriteria' })
  password: string;

  @IsEnum(EducationLevel)
  educationLevel: EducationLevel;

  @IsOptional()
  @IsString()
  @Matches(/^01[0125][0-9]{8}$/, {
    message: 'auth.errors.invalidPhone',
  })
  phoneNumber?: string;

  // If the user selects HIGH_SCHOOL, this field becomes mandatory.
  @ValidateIf(
    (o: RegisterDto) => o.educationLevel === EducationLevel.HIGH_SCHOOL,
  )
  @IsString()
  @IsNotEmpty({
    message: 'auth.errors.parentPhoneRequired',
  })
  @Matches(/^01[0125][0-9]{8}$/, {
    message: 'auth.errors.invalidParentPhone',
  })
  parentPhoneNumber?: string;

  @IsOptional()
  @IsString()
  profilePictureUrl?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
