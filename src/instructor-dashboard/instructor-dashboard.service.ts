import { AttemptStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstructorDashboardService {
  constructor(private prisma: PrismaService) {}

  async getInstructorStats(instructorId: string) {
    const courses = await this.prisma.courseInstructor.findMany({
      where: { instructorId, },
      select: { courseId: true },
    });
    const courseIds = courses.map((c) => c.courseId);

    const totalCourses = courseIds.length;

    // Count all unique students who accessed lectures in these courses
    const accesses = await this.prisma.studentLectureAccess.findMany({
      where: { lecture: { courseId: { in: courseIds } }, },
      select: { studentId: true },
    });
    const uniqueStudents = new Set(accesses.map((a) => a.studentId)).size;

    const codesGenerated = await this.prisma.activationCode.count({
      where: {
        OR: [
          { redeemedLecture: { courseId: { in: courseIds } } },
          { redeemedCourseId: { in: courseIds } }
        ]
      },
    });

    const pendingAttempts = await this.prisma.quizAttempt.count({
      where: {
        quiz: { lecture: { courseId: { in: courseIds } } },
        status: AttemptStatus.FAILED,
      },
    });

    return {
      totalCourses,
      totalStudents: uniqueStudents,
      codesGenerated,
      pendingGrading: pendingAttempts,
    };
  }

  async getInstructorStudents(instructorId: string) {
    const courses = await this.prisma.courseInstructor.findMany({
      where: { instructorId, },
      select: { courseId: true },
    });
    const courseIds = courses.map((c) => c.courseId);

    const accesses = await this.prisma.studentLectureAccess.findMany({
      where: { lecture: { courseId: { in: courseIds } }, },
      include: {
        student: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
        lecture: {
          select: {
            id: true,
            title: true,
            course: { select: { title: true } },
          },
        },
      },
    });

    return accesses.map((a) => ({
      studentId: a.student.id,
      fullName: a.student.fullName,
      email: a.student.email,
      phoneNumber: a.student.phoneNumber,
      courseTitle: a.lecture.course.title,
      lectureTitle: a.lecture.title,
      grantedAt: a.createdAt,
    }));
  }

  async getPendingExams(instructorId: string) {
    const courses = await this.prisma.courseInstructor.findMany({
      where: { instructorId, },
      select: { courseId: true },
    });
    const courseIds = courses.map((c) => c.courseId);

    const exams = await this.prisma.exam.findMany({
      where: {
        OR: [
          { courseId: { in: courseIds } },
          { lecture: { courseId: { in: courseIds } } },
        ],
      },
      select: { id: true },
    });
    const examIds = exams.map((e) => e.id);

    const pendingAttempts = await this.prisma.examAttempt.findMany({
      where: {
        examId: { in: examIds },
        status: AttemptStatus.PENDING,
        submittedAt: { not: null },
      },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        exam: { select: { id: true, title: true } },
        responses: { where: { earnedPoints: null } },
      },
    });

    return pendingAttempts.map((attempt) => ({
      attemptId: attempt.id,
      studentName: attempt.student.fullName,
      studentEmail: attempt.student.email,
      examTitle: attempt.exam.title,
      submittedAt: attempt.submittedAt,
      ungradedEssaysCount: attempt.responses.length,
    }));
  }
}

