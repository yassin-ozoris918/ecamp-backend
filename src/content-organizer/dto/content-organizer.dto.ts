import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export const MATERIAL_KINDS = ['lecture', 'chapter', 'course'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Where a lecture goes: a course, and optionally one of that course's chapters (null/omitted = "no chapter"). */
export class LectureDestinationDto {
  @IsUUID()
  courseId: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  chapterId?: string | null;
}

/**
 * Where a handout goes.
 *  - targetKind "lecture": students see it inside that lecture
 *  - targetKind "chapter" / "course": staff-only chapter / course files
 */
export class MoveMaterialDto {
  @IsIn(MATERIAL_KINDS)
  targetKind: MaterialKind;

  @IsUUID()
  targetId: string;
}

export class RenameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;
}

export class ReorderLectureMaterialsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];
}
