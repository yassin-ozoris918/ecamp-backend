import { IsNotEmpty, IsString, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { ActivationCodeType, EducationLevel } from '@prisma/client';

export class GenerateCodesDto {
  @IsNotEmpty()
  @IsEnum(ActivationCodeType)
  targetType: ActivationCodeType;

  @IsNotEmpty()
  @IsEnum(EducationLevel)
  educationLevel: EducationLevel;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(500)
  count: number;
}
