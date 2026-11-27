import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeviceChangeRequestDto {
  @IsString() @MaxLength(2000) changeToken!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReviewDeviceRequestDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DeviceRequestsQueryDto {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
