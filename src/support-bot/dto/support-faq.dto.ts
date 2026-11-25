import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class SupportFaqDto {
  @IsOptional() @IsString() @MaxLength(300) questionEn?: string;
  @IsOptional() @IsString() @MaxLength(300) questionAr?: string;
  @IsOptional() @IsString() @MaxLength(3000) answerEn?: string;
  @IsOptional() @IsString() @MaxLength(3000) answerAr?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  phrasings?: string[];

  @IsOptional() @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @IsString() @MaxLength(500) linkUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(60) linkLabelEn?: string | null;
  @IsOptional() @IsString() @MaxLength(60) linkLabelAr?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class AskBotDto {
  @IsString() @MaxLength(2000) message!: string;
  @IsOptional() @IsIn(['ar', 'en']) lang?: 'ar' | 'en';
}

export class PickFaqDto {
  @IsUUID() faqId!: string;
  @IsOptional() @IsIn(['ar', 'en']) lang?: 'ar' | 'en';
}

export class BotFeedbackDto {
  @IsUUID() id!: string;
  @IsBoolean() helpful!: boolean;
}

export class TestBotDto {
  @IsString() @MaxLength(2000) message!: string;
}

export class ResolveQueriesDto {
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids!: string[];
}
