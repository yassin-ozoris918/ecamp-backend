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
        attachments: { select: { id: true, title: true, fileUrl: true, type: true } },
        _count: {
          select: { lectures: true, chapters: true, studentAccess: true },
        },
      },
    });
  }

  async getCourseAnalytics(instructorId: string, courseId: string) {
    await this.checkCourseAssignment(instructorId, courseId);
    
    const courseAccessStudents = await this.prisma.studentCourseAccess.findMany({
      where: { courseId },
      select: { studentId: true }
    });
    
    const lectureAccessStudents = await this.prisma.studentLectureAccess.findMany({
      where: { lecture: { courseId } },
      select: { studentId: true }
    });

    const fullCourseStudentsSet = new Set(courseAccessStudents.map(s => s.studentId));
    const lectureAccessStudentsSet = new Set(lectureAccessStudents.map(s => s.studentId));

    const uniqueStudents = new Set([
      ...fullCourseStudentsSet,
      ...lectureAccessStudentsSet
    ]);
    const enrolledStudents = uniqueStudents.size;
    const fullCourseEnrolled = fullCourseStudentsSet.size;
    const lectureOnlyEnrolled = enrolledStudents - fullCourseEnrolled;

    const startedStudents = await this.prisma.studentLectureAccess.findMany({
      where: { lecture: { courseId }, isStarted: true },
      select: { studentId: true }
    });
    const studentsStarted = new Set(startedStudents.map(s => s.studentId)).size;

    const totalLectures = await this.prisma.lecture.count({ where: { courseId } });
    const completedProgress = await this.prisma.sessionProgress.count({
      where: { isCompleted: true, session: { lecture: { courseId } } }
    });

    // 1. Progress Distribution
    const allSessions = await this.prisma.session.count({ where: { lecture: { courseId } } });
    const progressDistribution = { '0': 0, '1-50': 0, '51-99': 0, '100': 0 };

    if (allSessions > 0) {
      const studentProgress = await this.prisma.sessionProgress.findMany({
        where: { session: { lecture: { courseId } }, isCompleted: true },
        select: { studentId: true }
      });
      
      const counts = studentProgress.reduce((acc, p) => {
        acc[p.studentId] = (acc[p.studentId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      uniqueStudents.forEach(studentId => {
        const completed = counts[studentId] || 0;
        const percentage = (completed / allSessions) * 100;
        if (percentage === 0) progressDistribution['0']++;
        else if (percentage <= 50) progressDistribution['1-50']++;
        else if (percentage < 100) progressDistribution['51-99']++;
        else progressDistribution['100']++;
      });
    } else {
       progressDistribution['0'] = uniqueStudents.size;
    }

    // 2. Enrollments Timeline (Last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0,0,0,0);
    
    const timelineData = await this.prisma.studentCourseAccess.findMany({
      where: { courseId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true }
    });
    
    const timelineGroups = timelineData.reduce((acc, curr) => {
      const date = curr.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const enrollmentsTimeline = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      return {
        date: dateStr,
        count: timelineGroups[dateStr] || 0
      };
    });

    // 3. Top Lectures
    const allLecturesWithCounts = await this.prisma.lecture.findMany({
      where: { courseId },
      include: { _count: { select: { studentAccess: true } } }
    });
    const topLectures = allLecturesWithCounts
      .sort((a, b) => b._count.studentAccess - a._count.studentAccess)
      .slice(0, 3)
      .map(l => ({ id: l.id, title: l.title, watches: l._count.studentAccess }));

    // 4. Recent Activity Feed
    const recentCourseAccess = await this.prisma.studentCourseAccess.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { student: { select: { fullName: true } } }
    });
    const recentLectureAccess = await this.prisma.studentLectureAccess.findMany({
      where: { lecture: { courseId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { student: { select: { fullName: true } }, lecture: { select: { title: true } } }
    });
    const recentActivity = [
      ...recentCourseAccess.map(a => ({
        type: 'ENROLLMENT',
        studentName: a.student?.fullName || 'Unknown Student',
        date: a.createdAt
      })),
      ...recentLectureAccess.map(a => ({
        type: 'LECTURE_ACCESS',
        studentName: a.student?.fullName || 'Unknown Student',
        lectureTitle: a.lecture?.title,
        date: a.createdAt
      }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);

    return {
      enrolledStudents,
      fullCourseEnrolled,
      lectureOnlyEnrolled,
      studentsStarted,
      totalLectures,
      completedProgress,
      courseCompletionEstimate: enrolledStudents > 0 ? (studentsStarted / enrolledStudents) * 100 : 0,
      progressDistribution,
      enrollmentsTimeline,
      topLectures,
      recentActivity
    };
  }

  async getCourseStudents(instructorId: string, courseId: string, page: number, limit: number) {
    await this.checkCourseAssignment(instructorId, courseId);
    const skip = (page - 1) * limit;

    const courseAccess = await this.prisma.studentCourseAccess.findMany({
      where: { courseId },
      select: { studentId: true, createdAt: true }
    });
    
    const lectureAccess = await this.prisma.studentLectureAccess.findMany({
      where: { lecture: { courseId } },
      select: { studentId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });

    const studentMap = new Map<string, Date>();
    courseAccess.forEach(a => studentMap.set(a.studentId, a.createdAt));
    lectureAccess.forEach(a => {
      if (!studentMap.has(a.studentId) || a.createdAt < studentMap.get(a.studentId)!) {
        studentMap.set(a.studentId, a.createdAt);
      }
    });

    const uniqueStudentIds = Array.from(studentMap.keys());
    const total = uniqueStudentIds.length;
    
    const sortedIds = uniqueStudentIds.sort((a, b) => studentMap.get(b)!.getTime() - studentMap.get(a)!.getTime());
    
    const paginatedIds = sortedIds.slice(skip, skip + limit);
    
    const studentsData = await this.prisma.user.findMany({
      where: { id: { in: paginatedIds } },
      select: { id: true, fullName: true, email: true, profilePictureUrl: true, createdAt: true }
    });

    const data = paginatedIds.map(id => {
      const s = studentsData.find(u => u.id === id);
      if (!s) return null;
      return {
        ...s,
        enrollmentDate: studentMap.get(id)
      };
    }).filter(Boolean);

    return { data, total, page, limit };
  }

  async getCourseLectures(instructorId: string, courseId: string) {
    await this.checkCourseAssignment(instructorId, courseId);
    return this.prisma.lecture.findMany({
      where: { courseId },
      include: {
        chapter: { select: { title: true } },
        attachments: { select: { id: true, title: true, fileUrl: true, type: true, createdAt: true } },
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
    
    const courseAccessStudents = await this.prisma.studentCourseAccess.findMany({
      where: { courseId },
      select: { studentId: true }
    });
    const thisLectureAccessStudents = await this.prisma.studentLectureAccess.findMany({
      where: { lectureId },
      select: { studentId: true, isStarted: true }
    });

    const uniqueEnrolledIds = new Set([
      ...courseAccessStudents.map(s => s.studentId),
      ...thisLectureAccessStudents.map(s => s.studentId)
    ]);
    const enrolledStudents = uniqueEnrolledIds.size;

    const watchedStudents = thisLectureAccessStudents.filter(s => s.isStarted).length;

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
      this.prisma.studentLectureAccess.count({ where: { lectureId, isStarted: true } }),
      this.prisma.studentLectureAccess.findMany({
        where: { lectureId, isStarted: true },
        skip,
        take: limit,
        orderBy: { activatedAt: 'desc' },
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

    const courseAccess = await this.prisma.studentCourseAccess.findMany({
      where: { courseId },
      select: { studentId: true }
    });
    
    const thisLectureAccess = await this.prisma.studentLectureAccess.findMany({
      where: { lectureId },
      select: { studentId: true, isStarted: true }
    });

    const canWatchIds = new Set([
      ...courseAccess.map(s => s.studentId),
      ...thisLectureAccess.map(s => s.studentId)
    ]);

    const watchedIds = new Set(thisLectureAccess.filter(s => s.isStarted).map(s => s.studentId));

    const unwatchedStudentIds = Array.from(canWatchIds).filter(id => !watchedIds.has(id));
    const total = unwatchedStudentIds.length;
    const paginatedIds = unwatchedStudentIds.slice(skip, skip + limit);

    const students = await this.prisma.user.findMany({
      where: { id: { in: paginatedIds } },
      select: { id: true, fullName: true, email: true, profilePictureUrl: true }
    });

    return { data: students, total, page, limit };
  }
}
