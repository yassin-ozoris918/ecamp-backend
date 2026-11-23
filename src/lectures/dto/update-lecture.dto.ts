import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateLectureDto } from './create-lecture.dto';

/**
 * courseId / chapterId are NOT editable here: moving a lecture changes who can access it, so it
 * goes through POST /content/lectures/:id/move, which validates the target and adjusts access.
 */
export class UpdateLectureDto extends PartialType(OmitType(CreateLectureDto, ['courseId', 'chapterId'] as const)) {}
