import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsUrl,
  Min,
  IsEnum,
} from 'class-validator';
import { VideoProvider } from '@prisma/client';

export class CreateSessionDto {
  @IsNotEmpty()
  @IsString()
  lectureId: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @IsOptional()
  @IsEnum(VideoProvider)
  videoProvider?: VideoProvider;

  @IsOptional()
  @IsString()
  amaanVideoId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
