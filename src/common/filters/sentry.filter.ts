import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class SentryFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Attach Context
    Sentry.withScope((scope) => {
      scope.setExtra('route', request.url);
      scope.setExtra('method', request.method);
      scope.setExtra('body', request.body);
      
      const user = (request as any).user;
      if (user) {
        scope.setUser({
          id: user.sub || user.id,
          role: user.role,
        });
      }

      // Check specific failures requested by user
      if (
        exception instanceof Prisma.PrismaClientKnownRequestError ||
        exception instanceof Prisma.PrismaClientInitializationError ||
        exception instanceof Prisma.PrismaClientUnknownRequestError ||
        exception instanceof Prisma.PrismaClientRustPanicError ||
        exception instanceof Prisma.PrismaClientValidationError
      ) {
        scope.setTag('type', 'database_failure');
      } else if (status === 401) {
        scope.setTag('type', 'authentication_failure');
      } else if (status === 403) {
        scope.setTag('type', 'authorization_failure');
      } else if (exception.message?.toLowerCase().includes('ai') || exception.message?.toLowerCase().includes('gemini')) {
        scope.setTag('type', 'ai_service_failure');
      } else if (exception.message?.toLowerCase().includes('s3') || exception.message?.toLowerCase().includes('storage')) {
        scope.setTag('type', 'storage_failure');
      } else if (status >= 500) {
        scope.setTag('type', 'unhandled_exception');
      }

      // Capture the exception in Sentry
      Sentry.captureException(exception);
    });

    // Determine standard response message
    let message = exception.message || 'Internal server error';
    let code: string | undefined = undefined;
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'object') {
        if ((resp as any).message) {
          message = (resp as any).message;
        }
        if ((resp as any).code) {
          code = (resp as any).code;
        }
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(code && { code }),
    });
  }
}
