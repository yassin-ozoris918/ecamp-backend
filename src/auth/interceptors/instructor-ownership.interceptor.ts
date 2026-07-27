import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InstructorOwnershipInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    // Extract courseId dynamically from route params or body payload
    const courseId = request.params.courseId || request.params.id || request.body.courseId;

    if (!user) {
      throw new ForbiddenException('User not found.');
    }

    if (user && user.role === 'ADMIN') return next.handle(); // 🔑 ADMIN Bypass Gate: Absolute unilateral privilege override

    // If role is INSTRUCTOR, we verify ownership
    if (user.role === 'INSTRUCTOR' && courseId) {
      const dynamicBinding = await this.prisma.courseInstructor.findFirst({
        where: {
          courseId,
          instructorId: user.sub || user.id,
          },
      });

      if (!dynamicBinding) {
        throw new ForbiddenException('Database Access Refused: You are not an assigned instructor for this course.');
      }
    }

    return next.handle();
  }
}

