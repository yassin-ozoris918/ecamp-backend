import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { ActivationCodeType } from '@prisma/client';

export class RedeemCodeDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  targetId: string;

  @IsNotEmpty()
  @IsEnum(ActivationCodeType)
  targetType: ActivationCodeType;
}
