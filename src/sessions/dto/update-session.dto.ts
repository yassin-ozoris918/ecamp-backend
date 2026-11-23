import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSessionDto } from './create-session.dto';

/** lectureId is not editable: a session cannot be silently moved to another lecture by an update. */
export class UpdateSessionDto extends PartialType(OmitType(CreateSessionDto, ['lectureId'] as const)) {}
