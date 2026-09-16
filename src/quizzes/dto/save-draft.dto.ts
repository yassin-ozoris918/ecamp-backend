import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class DraftAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsOptional()
  @IsNumber()
  selectedOptionIndex?: number;

  @IsOptional()
  @IsString()
  textResponse?: string;

  @IsOptional()
  @IsArray()
  matchAnswer?: any[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderAnswer?: string[];
}

export class SaveDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftAnswerDto)
  answers: DraftAnswerDto[];
}
