import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';
export const Audit = (actionType: string) => SetMetadata(AUDIT_ACTION_KEY, actionType);
