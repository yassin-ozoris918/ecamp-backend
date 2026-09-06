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
import { 
  EducationLevel, 
  HighSchoolSystem, 
  StudyMode, 
  StudyLanguage, 
  HighSchoolGrade, 
  TraditionalBranch, 
  BaccalaureatePath 
} from '@prisma/client';

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

  // --- High School Dimensions ---
  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.HIGH_SCHOOL)
  @IsEnum(HighSchoolSystem)
  @IsNotEmpty()
  highSchoolSystem?: HighSchoolSystem;

  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.HIGH_SCHOOL)
  @IsEnum(StudyMode)
  @IsNotEmpty()
  studyMode?: StudyMode;

  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.HIGH_SCHOOL)
  @IsEnum(StudyLanguage)
  @IsNotEmpty()
  studyLanguage?: StudyLanguage;

  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.HIGH_SCHOOL)
  @IsEnum(HighSchoolGrade)
  @IsNotEmpty()
  highSchoolGrade?: HighSchoolGrade;

  @ValidateIf((o: RegisterDto) => 
    o.educationLevel === EducationLevel.HIGH_SCHOOL && 
    o.highSchoolSystem === HighSchoolSystem.TRADITIONAL && 
    (o.highSchoolGrade === HighSchoolGrade.GRADE_2 || o.highSchoolGrade === HighSchoolGrade.GRADE_3)
  )
  @IsEnum(TraditionalBranch)
  @IsNotEmpty()
  traditionalBranch?: TraditionalBranch;

  @ValidateIf((o: RegisterDto) => 
    o.educationLevel === EducationLevel.HIGH_SCHOOL && 
    o.highSchoolSystem === HighSchoolSystem.BACCALAUREATE && 
    (o.highSchoolGrade === HighSchoolGrade.GRADE_2 || o.highSchoolGrade === HighSchoolGrade.GRADE_3)
  )
  @IsEnum(BaccalaureatePath)
  @IsNotEmpty()
  baccalaureatePath?: BaccalaureatePath;

  // --- University Dimensions ---
  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.UNIVERSITY)
  @IsString()
  @IsOptional()
  university?: string;

  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.UNIVERSITY)
  @IsString()
  @IsOptional()
  faculty?: string;

  @ValidateIf((o: RegisterDto) => o.educationLevel === EducationLevel.UNIVERSITY)
  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  academicYear?: string;
}
