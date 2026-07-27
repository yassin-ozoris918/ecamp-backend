import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LevelIsolationGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Instructors and Admins are exempt from level isolation reading restrictions
    if (!user || user.role === 'ADMIN' || user.role === 'INSTRUCTOR') {
      return true;
    }

    // If the route has an 'id' parameter (assuming it's a course ID or similar)
    const courseId = request.params.id || request.params.courseId;

    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { audienceType: true, status: true },
      });

      if (!course) {
        return false; // Will return 403 or 404 downstream
      }

      // 1. DRAFT check for students
      if (course.status === 'DRAFT') {
        throw new ForbiddenException('You cannot access draft courses.');
      }

      // 2. Education Level Isolation check for students
      // We must fetch the user's education level to be safe, since it might not be in the JWT
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.sub || user.id },
        select: { educationLevel: true },
      });

      if (dbUser && dbUser.educationLevel !== course.audienceType) {
        throw new ForbiddenException(
          'You are not authorized to view courses outside of your education level.',
        );
      }
    }

    return true;
  }
}
