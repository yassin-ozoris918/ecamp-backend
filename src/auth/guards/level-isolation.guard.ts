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

      // 2. Education Level & Segmentation Isolation check for students
      // Fetch the user's education level and segmentation details
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.sub || user.id },
        select: { 
          educationLevel: true,
          highSchoolSystem: true,
          studyMode: true,
          studyLanguage: true,
          highSchoolGrade: true,
          traditionalBranch: true,
          baccalaureatePath: true,
          universityId: true,
          facultyId: true,
          departmentId: true,
          programId: true,
        },
      });

      if (!dbUser) {
        return false;
      }

      // Re-fetch the full course with targeting fields
      const fullCourse = await this.prisma.course.findUnique({
        where: { id: courseId },
      });

      if (!fullCourse) {
        return false;
      }


      // 3. Evaluate Targeting Rules
      if (dbUser.educationLevel !== fullCourse.audienceType) {
        throw new ForbiddenException('You are not authorized to view courses outside of your education level.');
      }

      if (fullCourse.audienceType === 'HIGH_SCHOOL') {
        if (fullCourse.targetHighSchoolSystem && fullCourse.targetHighSchoolSystem !== dbUser.highSchoolSystem) throw new ForbiddenException('Course restricted by educational system.');
        if (fullCourse.targetStudyMode && fullCourse.targetStudyMode !== dbUser.studyMode) throw new ForbiddenException('Course restricted by study mode.');
        if (fullCourse.targetStudyLanguage && fullCourse.targetStudyLanguage !== dbUser.studyLanguage) throw new ForbiddenException('Course restricted by study language.');
        if (fullCourse.targetHighSchoolGrade && fullCourse.targetHighSchoolGrade !== dbUser.highSchoolGrade) throw new ForbiddenException('Course restricted by grade.');
        if (fullCourse.targetTraditionalBranch && fullCourse.targetTraditionalBranch !== dbUser.traditionalBranch) throw new ForbiddenException('Course restricted by branch.');
        if (fullCourse.targetBaccalaureatePath && fullCourse.targetBaccalaureatePath !== dbUser.baccalaureatePath) throw new ForbiddenException('Course restricted by path.');
      } else if (fullCourse.audienceType === 'UNIVERSITY') {
        if (fullCourse.targetUniversityId && fullCourse.targetUniversityId !== dbUser.universityId) throw new ForbiddenException('Course restricted by university.');
        if (fullCourse.targetFacultyId && fullCourse.targetFacultyId !== dbUser.facultyId) throw new ForbiddenException('Course restricted by faculty.');
        if (fullCourse.targetDepartmentId && fullCourse.targetDepartmentId !== dbUser.departmentId) throw new ForbiddenException('Course restricted by department.');
        if (fullCourse.targetProgramId && fullCourse.targetProgramId !== dbUser.programId) throw new ForbiddenException('Course restricted by program.');
      }
    }

    return true;
  }
}
