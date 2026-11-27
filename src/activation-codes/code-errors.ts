import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Activation-code errors carry a stable `code` plus `details` so the app can show a precise,
 * translated explanation and the next step. `message` stays a readable English fallback.
 *
 * Codes:
 *  CODE_NOT_FOUND, CODE_ALREADY_USED, CODE_ALREADY_USED_BY_YOU, CODE_WRONG_LEVEL, CODE_WRONG_TYPE,
 *  TARGET_NOT_FOUND, NOT_ELIGIBLE, ALREADY_HAVE_ACCESS, COURSE_CODE_MATERIALS_ONLY, PICK_COURSE,
 *  LECTURE_CODE_USE_LECTURE_PAGE,
 *  and the "needs a decision" ones (409, nothing redeemed yet):
 *  FILE_CODE_PICK_FILE, CONFIRM_COURSE_FILES, CONFIRM_LECTURE, CONFIRM_COURSE.
 */
type Kind = 'badRequest' | 'forbidden' | 'notFound' | 'conflict';

export function codeError(kind: Kind, code: string, message: string, details?: Record<string, unknown>): never {
  const body = { message, code, ...(details ? { details } : {}) };
  switch (kind) {
    case 'notFound':
      throw new NotFoundException(body);
    case 'forbidden':
      throw new ForbiddenException(body);
    case 'conflict':
      throw new ConflictException(body);
    default:
      throw new BadRequestException(body);
  }
}
