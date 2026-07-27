import { IsNotEmpty, IsString, IsNumber, IsInt, ArrayNotEmpty, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderItemDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsInt()
  @IsNumber()
  orderIndex: number;
}

export class ReorderDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['chapter', 'lecture', 'session', 'quiz', 'quiz-question'])
  entityType: string;

  @IsNotEmpty()
  @IsString()
  parentId: string;

  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
