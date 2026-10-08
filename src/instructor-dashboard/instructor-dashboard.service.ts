import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstructorDashboardService {
  constructor(private prisma: PrismaService) {}

  private async checkCourseAssignment(instructorId: string, courseId: string) {
    const isAssigned = await this.prisma.courseInstructor.findFirst({
      where: {
        courseId,
        instructorId,
      },
    });
    if (!isAssigned) {
      throw new ForbiddenException('You are not assigned to this course.');
    }
  }

  async getInstructorCourses(instructorId: string) {
    const assignments = await this.prisma.courseInstructor.findMany({
      where: { instructorId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            description: true,
            updatedAt: true,
            _count: {
              select: { lectures: true, chapters: true, studentAccess: true },
            },
          },
        },
      },
    });
    return assignments.map(a => a.course);
  }

  async getCourseOverview(instructorId: string, courseId: string) {
    await this.checkCourseAssignment(instructorId, courseId);
    return this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        _count: {
          select: { lectures: true, chapters: true, studentAccess: true },
        },
      },
    });
  }

  async getCourseAnalytics(instructorId: string, courseId: string) {
    await this.checkCourseAssignment(instructorId, courseId);
    
    const enrolledStudents = await this.prisma.studentCourseAccess.count({ where: { courseId } });
    const startedStudents = await this.prisma.studentLectureAccess.groupBy({
      by: ['studentId'],
      where: { lecture: { courseId } },
    });
    const studentsStarted = startedStudents.length;

    const totalLectures = await this.prisma.lecture.count({ where: { courseId } });
    const completedProgress = await this.prisma.sessionProgress.count({
      where: { isCompleted: true, session: { lecture: { courseId } } }
    });

    return {
      enrolledStudents,
      studentsStarted,
      totalLectures,
      completedProgress,
      courseCompletionEstimate: enrolledStudents > 0 ? (studentsStarted / enrolledStudents) * 100 : 0
    };
  }

  async getCourseStudents(instructorId: string, courseId: string, page: number, limit: number) {
    await this.checkCourseAssignment(instructorId, courseId);
    const skip = (page - 1) * limit;

    const [total, students] = await Promise.all([
      this.prisma.studentCourseAccess.count({ where: { courseId } }),
      this.prisma.studentCourseAccess.findMany({
        where: { courseId },
        skip,
        take: limit,
        include: {
          student: { select: { id: true, fullName: true, email: true, profilePictureUrl: true, createdAt: true } }
        }
      })
    ]);

    return { data: students.map(s => ({ ...s.student, enrollmentDate: s.createdAt })), total, page, limit };
  }

  async getCourseLectures(instructorId: string, courseId: string) {
    await this.checkCourseAssignment(instructorId, courseId);
    return this.prisma.lecture.findMany({
      where: { courseId },
      include: {
        chapter: { select: { title: true } },
        _count: { select: { studentAccess: true, sessions: true } }
      },
      orderBy: [
        { chapter: { sortOrder: 'asc' } },
        { sortOrder: 'asc' }
      ]
    });
  }

  async getLectureAnalytics(instructorId: string, courseId: string, lectureId: string) {
    await this.checkCourseAssignment(instructorId, courseId);
    
    const enrolledStudents = await this.prisma.studentCourseAccess.count({ where: { courseId } });
    const watchedStudents = await this.prisma.studentLectureAccess.count({
      where: { lectureId }
    });

    return {
      enrolledStudents,
      watchedStudents,
      unwatchedStudents: enrolledStudents - watchedStudents,
      watchRate: enrolledStudents > 0 ? (watchedStudents / enrolledStudents) * 100 : 0
    };
  }

  async getLectureWatchers(instructorId: string, courseId: string, lectureId: string, page: number, limit: number) {
    await this.checkCourseAssignment(instructorId, courseId);
    const skip = (page - 1) * limit;

    const [total, watchers] = await Promise.all([
      this.prisma.studentLectureAccess.count({ where: { lectureId } }),
      this.prisma.studentLectureAccess.findMany({
        where: { lectureId },
        skip,
        take: limit,
        include: {
          student: { select: { id: true, fullName: true, email: true, profilePictureUrl: true } }
        }
      })
    ]);

    return { data: watchers.map(w => ({ ...w.student, firstWatched: w.createdAt, lastWatched: w.activatedAt || w.createdAt })), total, page, limit };
  }

  async getLectureUnwatchedStudents(instructorId: string, courseId: string, lectureId: string, page: number, limit: number) {
    await this.checkCourseAssignment(instructorId, courseId);
    const skip = (page - 1) * limit;

    const courseStudents = await this.prisma.studentCourseAccess.findMany({
      where: { courseId },
      select: { studentId: true }
    });
    const courseStudentIds = courseStudents.map(s => s.studentId);

    const watchedStudents = await this.prisma.studentLectureAccess.findMany({
      where: { lectureId },
      select: { studentId: true }
    });
    const watchedStudentIds = new Set(watchedStudents.map(s => s.studentId));

    const unwatchedStudentIds = courseStudentIds.filter(id => !watchedStudentIds.has(id));
    const paginatedIds = unwatchedStudentIds.slice(skip, skip + limit);

    const students = await this.prisma.user.findMany({
      where: { id: { in: paginatedIds } },
      select: { id: true, fullName: true, email: true, profilePictureUrl: true }
    });

    return { data: students, total: unwatchedStudentIds.length, page, limit };
  }
}
