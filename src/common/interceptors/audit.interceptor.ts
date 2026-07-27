import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit.decorator';

@Injectable()
export class SystemAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SystemAuditInterceptor.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const actionType = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!actionType) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Fallback logic for IP address
    const ipAddress = request.headers['cf-connecting-ip'] 
      || request.headers['x-forwarded-for'] 
      || request.ip 
      || '0.0.0.0';

    return next.handle().pipe(
      tap({
        next: () => {
          // Fire and forget logging
          if (user?.id) {
            this.logAction(user.id, actionType, request.body, ipAddress);
          }
        },
        error: () => {
          // We can optionally log failed attempts
          if (user?.id) {
             this.logAction(user.id, `${actionType}_FAILED`, request.body, ipAddress);
          }
        }
      }),
    );
  }

  private async logAction(actorId: string, actionType: string, payload: any, ipAddress: string | string[]) {
    try {
      const sanitizedPayload = { ...payload };
      if (sanitizedPayload.password) sanitizedPayload.password = '[REDACTED]';

      await this.prisma.systemAuditLog.create({
        data: {
          actorId,
          actionType,
          payload: JSON.stringify(sanitizedPayload),
          ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to write to SystemAuditLog: ${e.message}`);
    }
  }
}
