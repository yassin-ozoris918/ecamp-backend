import { Request } from 'express';
import { Role } from '@prisma/client';

export interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: Role;
    refreshToken?: string;
    /** Trusted device and browser this login belongs to (students only). */
    did?: string;
    bid?: string;
  };
}
