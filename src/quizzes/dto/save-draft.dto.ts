import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DraftAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsNumber()
  selectedOptionIndex: number;
}

export class SaveDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftAnswerDto)
  answers: DraftAnswerDto[];
}
