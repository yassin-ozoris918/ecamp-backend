import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, CodeStatus, AttemptStatus } from '@prisma/client';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getUsers(query: GetUsersQueryDto) {
    const {
      search,
      role,
      educationLevel,
      isActive,
      dateFrom,
      dateTo,
      includeDeleted,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      skip = 0,
      take = 50,
    } = query;

    const ALLOWED_SORT_FIELDS = ['createdAt', 'fullName', 'email', 'role', 'educationLevel'];
    if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
      throw new BadRequestException(`Invalid sortBy field: ${sortBy}`);
    }

    const where: any = {};

    // Soft delete filter
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    if (role) where.role = role;
    if (educationLevel) where.educationLevel = educationLevel;
    if (isActive !== undefined) where.isActive = isActive;

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    // Search filter (partial case-insensitive on fullName, email, phoneNumber)
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          educationLevel: true,
          xp: true,
          streakDays: true,
          createdAt: true,
          lastLoginAt: true,
          phoneNumber: true,
          deviceId: true,
          profilePictureUrl: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        educationLevel: true,
        phoneNumber: true,
        parentPhoneNumber: true,
        profilePictureUrl: true,
        xp: true,
        streakDays: true,
        deviceId: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            accessedLectures: true,
            quizAttempts: true,
            examAttempts: true,
            deviceSessions: true,
            certificates: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(
    userId: string,
    data: {
      isActive?: boolean;
      role?: Role;
      fullName?: string;
      email?: string;
      educationLevel?: any;
      deviceId?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (data.deviceId === null) {
      await this.resetDeviceLock(userId);
      delete data.deviceId;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        deviceId: true,
      },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        deletedAt: new Date(),
        email: `${user.email}_deleted_${Date.now()}`
      },
    });

    return { message: 'User deleted successfully' };
  }

  async forceLogout(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return { message: 'User logged out successfully' };
  }

  async resetPassword(userId: string, newPasswordHash: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: newPasswordHash },
    });

    return { message: 'Password reset successfully' };
  }

  async resetDeviceLock(userId: string, ipAddress?: string, browser?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deviceId: null },
      });

      // Also clear DeviceSessions
      await tx.deviceSession.updateMany({
        where: { studentId: userId, },
        data: { deletedAt: new Date() },
      });

      if (user.deviceId) {
        await tx.deviceHistory.create({
          data: {
            studentId: userId,
            deviceFingerprint: user.deviceId,
            action: 'RESET',
            ipAddress,
            browser,
          },
        });
      }
    });

    return { message: 'Device lock reset successfully' };
  }

  async getDeviceHistory(userId: string, skip: number = 0, take: number = 50) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const [items, total] = await Promise.all([
      this.prisma.deviceHistory.findMany({
        where: { studentId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.deviceHistory.count({
        where: { studentId: userId },
      }),
    ]);

    return { items, total, skip, take };
  }

  async resetQuizAttempts(studentId: string, quizId: string) {
    await this.prisma.quizAttempt.deleteMany({
      where: { studentId, quizId },
    });
    return { message: 'Quiz attempts reset successfully' };
  }

  async resetExamAttempts(studentId: string, examId: string) {
    await this.prisma.examAttempt.deleteMany({
      where: { studentId, examId },
    });
    return { message: 'Exam attempts reset successfully' };
  }

  async grantLectureAccess(studentId: string, lectureId: string, validityDays?: number) {
    const expiresAt = validityDays
      ? new Date(Date.now() + validityDays * 86400000)
      : null;

    await this.prisma.studentLectureAccess.upsert({
      where: {
        studentId_lectureId: { studentId, lectureId },
      },
      update: {
        activatedAt: new Date(),
        expiresAt,
        },
      create: {
        studentId,
        lectureId,
        activatedAt: new Date(),
        expiresAt,
      },
    });

    return { message: 'Lecture access granted successfully' };
  }

  async removeLectureAccess(studentId: string, lectureId: string) {
    await this.prisma.studentLectureAccess.updateMany({
      where: { studentId, lectureId, },
      data: { deletedAt: new Date() },
    });
    return { message: 'Lecture access removed successfully' };
  }

  async extendLectureExpiry(studentId: string, lectureId: string, extraDays: number) {
    const access = await this.prisma.studentLectureAccess.findFirst({
      where: { studentId, lectureId, },
    });
    if (!access) throw new NotFoundException('Lecture access not found');

    const currentExpiry = access.expiresAt || new Date();
    const newExpiry = new Date(currentExpiry.getTime() + extraDays * 86400000);

    await this.prisma.studentLectureAccess.update({
      where: { studentId_lectureId: { studentId, lectureId } },
      data: { expiresAt: newExpiry },
    });

    return { message: `Lecture access extended by ${extraDays} days` };
  }

  async getAuditLogs(skip: number = 0, take: number = 50) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { items, total, skip, take };
  }

  async getSystemAuditLogs(skip: number = 0, take: number = 50) {
    const [items, total] = await Promise.all([
      this.prisma.systemAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          actor: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.systemAuditLog.count(),
    ]);
    return { items, total, skip, take };
  }

  async getStudentProgress(studentId: string) {
    const lectures = await this.prisma.studentLectureAccess.findMany({
      where: { studentId, },
      include: {
        lecture: {
          include: {
            course: { select: { id: true, title: true } },
          },
        },
      },
    });

    const quizAttempts = await this.prisma.quizAttempt.findMany({
      where: { studentId },
      include: {
        quiz: { select: { id: true, title: true, passGrade: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const examAttempts = await this.prisma.examAttempt.findMany({
      where: { studentId },
      include: {
        exam: { select: { id: true, title: true, passGrade: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      lectures: lectures.map((l) => ({
        lectureId: l.lectureId,
        lectureTitle: l.lecture.title,
        courseTitle: l.lecture.course.title,
        activatedAt: l.activatedAt,
        expiresAt: l.expiresAt,
      })),
      quizAttempts: quizAttempts.map((a) => ({
        quizId: a.quizId,
        quizTitle: a.quiz?.title,
        score: a.score,
        status: a.status,
        passGrade: a.quiz?.passGrade,
        submittedAt: a.submittedAt,
      })),
      examAttempts: examAttempts.map((a) => ({
        examId: a.examId,
        examTitle: a.exam?.title,
        score: a.score,
        status: a.status,
        passGrade: a.exam?.passGrade,
        submittedAt: a.submittedAt,
      })),
    };
  }

  async getPlatformStats() {
    const totalUsers = await this.prisma.user.count({
      where: { },
    });
    const totalStudents = await this.prisma.user.count({
      where: { role: Role.STUDENT, },
    });
    const totalInstructors = await this.prisma.user.count({
      where: { role: Role.INSTRUCTOR, },
    });
    const totalAdmin = await this.prisma.user.count({
      where: { role: Role.ADMIN, },
    });
    const activeUsers = await this.prisma.user.count({
      where: { isActive: true, },
    });
    const suspendedUsers = await this.prisma.user.count({
      where: { isActive: false, },
    });
    const totalCourses = await this.prisma.course.count({
      where: { },
    });
    const publishedCourses = await this.prisma.course.count({
      where: { status: 'PUBLISHED', },
    });
    const totalCodesGenerated = await this.prisma.activationCode.count({
      where: { },
    });
    const totalCodesRedeemed = await this.prisma.activationCode.count({
      where: { status: CodeStatus.REDEEMED, },
    });
    const totalLectureAccess = await this.prisma.studentLectureAccess.count({
      where: { },
    });
    const totalCertificates = await this.prisma.certificate.count({
      where: { },
    });

    // Daily active users (last 24h)
    const oneDayAgo = new Date(Date.now() - 86400000);
    const dailyActiveUsers = await this.prisma.user.count({
      where: { lastLoginAt: { gte: oneDayAgo }, },
    });

    return {
      totalUsers,
      totalStudents,
      totalInstructors,
      totalAdmin,
      activeUsers,
      suspendedUsers,
      totalCourses,
      publishedCourses,
      totalCodesGenerated,
      totalCodesRedeemed,
      totalLectureAccess,
      totalCertificates,
      dailyActiveUsers,
    };
  }

  async getAtRiskStudents(daysInactive: number = 7) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysInactive);

    const atRiskStudents = await this.prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        lastLoginAt: true,
        xp: true,
      },
      orderBy: { lastLoginAt: 'asc' },
      take: 50,
    });

    return atRiskStudents;
  }

  async overrideProgress(
    studentId: string,
    itemType: 'SESSION' | 'QUIZ' | 'EXAM' | 'COURSE',
    itemId: string,
  ) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId, role: Role.STUDENT },
    });
    if (!student) throw new NotFoundException('Student not found');

    if (itemType === 'SESSION') {
      const session = await this.prisma.session.findUnique({ where: { id: itemId } });
      if (!session) throw new NotFoundException('Session not found');

      await this.prisma.sessionProgress.upsert({
        where: { studentId_sessionId: { studentId, sessionId: itemId } },
        update: { isCompleted: true },
        create: { studentId, sessionId: itemId, isCompleted: true },
      });
      return { message: 'Session manually unlocked successfully.' };
    } else if (itemType === 'QUIZ') {
      const quiz = await this.prisma.quiz.findUnique({ where: { id: itemId } });
      if (!quiz) throw new NotFoundException('Quiz not found');

      await this.prisma.quizAttempt.create({
        data: {
          quizId: itemId,
          studentId,
          score: quiz.passGrade,
          status: AttemptStatus.PASSED,
        },
      });
      return { message: 'Quiz manually passed successfully.' };
    } else if (itemType === 'EXAM') {
      const exam = await this.prisma.exam.findUnique({ where: { id: itemId } });
      if (!exam) throw new NotFoundException('Exam not found');

      await this.prisma.examAttempt.create({
        data: {
          examId: itemId,
          studentId,
          score: exam.passGrade,
          status: AttemptStatus.PASSED,
        },
      });
      return { message: 'Exam manually passed successfully.' };
    } else if (itemType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: itemId },
        include: {
          exams: true,
          chapters: {
            include: {
              exams: true,
              lectures: {
                include: { sessions: true, quizzes: true, exams: true }
              }
            }
          },
          lectures: {
            include: { sessions: true, quizzes: true, exams: true }
          }
        }
      });
      if (!course) throw new NotFoundException('Course not found');

      const allSessions: any[] = [];
      const allQuizzes: any[] = [];
      const allExams: any[] = [...course.exams];

      for (const ch of course.chapters) {
        allExams.push(...ch.exams);
        for (const l of ch.lectures) {
          allSessions.push(...l.sessions);
          allQuizzes.push(...l.quizzes);
          allExams.push(...l.exams);
        }
      }
      for (const l of course.lectures) {
        allSessions.push(...l.sessions);
        allQuizzes.push(...l.quizzes);
        allExams.push(...l.exams);
      }

      await this.prisma.$transaction(async (tx) => {
        for (const s of allSessions) {
          await tx.sessionProgress.upsert({
            where: { studentId_sessionId: { studentId, sessionId: s.id } },
            update: { isCompleted: true },
            create: { studentId, sessionId: s.id, isCompleted: true },
          });
        }
        for (const q of allQuizzes) {
          await tx.quizAttempt.create({
            data: { quizId: q.id, studentId, score: q.passGrade, status: AttemptStatus.PASSED },
          });
        }
        for (const e of allExams) {
          await tx.examAttempt.create({
            data: { examId: e.id, studentId, score: e.passGrade, status: AttemptStatus.PASSED },
          });
        }
      });
      return { message: 'Entire course marked as completed.' };
    } else {
      throw new BadRequestException('Invalid item type.');
    }
  }

  async searchCatalog(query: string) {
    if (!query || query.trim() === '') return { courses: [], lectures: [] };
    const courses = await this.prisma.course.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      take: 10,
    });
    const lectures = await this.prisma.lecture.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      include: { course: true },
      take: 10,
    });
    return {
      courses: courses.map(c => ({ id: c.id, title: c.title, type: 'COURSE' })),
      lectures: lectures.map(l => ({ id: l.id, title: l.title, courseTitle: l.course.title, type: 'LECTURE' })),
    };
  }

  async grantCourseAccess(studentId: string, courseId: string, validityDays?: number) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const expiresAt = validityDays
      ? new Date(Date.now() + validityDays * 86400000)
      : null;

    await this.prisma.studentCourseAccess.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      update: { activatedAt: new Date(), expiresAt },
      create: { studentId, courseId, activatedAt: new Date(), expiresAt },
    });
    return { message: 'Course access granted successfully' };
  }

  async getStudentUnlockableItems(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId, role: Role.STUDENT },
      include: {
        accessedCourses: {
          include: {
            course: {
              include: {
                exams: true,
                chapters: {
                  include: { exams: true, lectures: { include: { sessions: true, quizzes: true, exams: true } } }
                },
                lectures: { include: { sessions: true, quizzes: true, exams: true } }
              }
            }
          }
        },
        accessedLectures: {
          include: {
            lecture: {
              include: { sessions: true, quizzes: true, exams: true, course: true }
            }
          }
        },
        sessionProgress: true,
        quizAttempts: true,
        examAttempts: true,
      }
    });

    if (!student) return [];

    const completedSessions = new Set(student.sessionProgress.filter(s => s.isCompleted).map(s => s.sessionId));
    const passedQuizzes = new Set(student.quizAttempts.filter(q => q.status === 'PASSED').map(q => q.quizId));
    const passedExams = new Set(student.examAttempts.filter(e => e.status === 'PASSED').map(e => e.examId));

    const items: { id: string; title: string; type: string; parentCourseId: string; parentCourseTitle: string; isCompleted: boolean }[] = [];

    // Collect from accessible courses
    for (const ca of student.accessedCourses) {
      const c = ca.course;
      for (const e of c.exams) items.push({ id: e.id, title: e.title, type: 'EXAM', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: passedExams.has(e.id) });
      for (const ch of c.chapters) {
        for (const e of ch.exams) items.push({ id: e.id, title: e.title, type: 'EXAM', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: passedExams.has(e.id) });
        for (const l of ch.lectures) {
          for (const s of l.sessions) items.push({ id: s.id, title: s.title, type: 'SESSION', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: completedSessions.has(s.id) });
          for (const q of l.quizzes) items.push({ id: q.id, title: q.title, type: 'QUIZ', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: passedQuizzes.has(q.id) });
          for (const e of l.exams) items.push({ id: e.id, title: e.title, type: 'EXAM', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: passedExams.has(e.id) });
        }
      }
      for (const l of c.lectures) {
        for (const s of l.sessions) items.push({ id: s.id, title: s.title, type: 'SESSION', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: completedSessions.has(s.id) });
        for (const q of l.quizzes) items.push({ id: q.id, title: q.title, type: 'QUIZ', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: passedQuizzes.has(q.id) });
        for (const e of l.exams) items.push({ id: e.id, title: e.title, type: 'EXAM', parentCourseId: c.id, parentCourseTitle: c.title, isCompleted: passedExams.has(e.id) });
      }
    }

    // Collect from accessible lectures
    for (const la of student.accessedLectures) {
      const l = la.lecture;
      const cTitle = l.course.title;
      const cId = l.course.id;
      for (const s of l.sessions) items.push({ id: s.id, title: s.title, type: 'SESSION', parentCourseId: cId, parentCourseTitle: cTitle, isCompleted: completedSessions.has(s.id) });
      for (const q of l.quizzes) items.push({ id: q.id, title: q.title, type: 'QUIZ', parentCourseId: cId, parentCourseTitle: cTitle, isCompleted: passedQuizzes.has(q.id) });
      for (const e of l.exams) items.push({ id: e.id, title: e.title, type: 'EXAM', parentCourseId: cId, parentCourseTitle: cTitle, isCompleted: passedExams.has(e.id) });
    }

    // Deduplicate by ID
    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
    return uniqueItems;
  }
}

