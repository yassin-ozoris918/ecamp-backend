import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, CodeStatus, AttemptStatus } from '@prisma/client';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import * as bcrypt from 'bcrypt';
import { normalizeEducationProfile } from '../common/utils/segmentation-validation.util';
import * as fs from 'fs';
import * as path from 'path';

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
      highSchoolSystem,
      studyMode,
      studyLanguage,
      highSchoolGrade,
      traditionalBranch,
      baccalaureatePath,
      universityId,
      facultyId,
      departmentId,
      programId,
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
    if (highSchoolSystem) where.highSchoolSystem = highSchoolSystem;
    if (studyMode) where.studyMode = studyMode;
    if (studyLanguage) where.studyLanguage = studyLanguage;
    if (highSchoolGrade) where.highSchoolGrade = highSchoolGrade;
    if (traditionalBranch) where.traditionalBranch = traditionalBranch;
    if (baccalaureatePath) where.baccalaureatePath = baccalaureatePath;
    if (universityId) where.universityId = universityId;
    if (facultyId) where.facultyId = facultyId;
    if (departmentId) where.departmentId = departmentId;
    if (programId) where.programId = programId;
    if (isActive !== undefined) where.isActive = isActive;

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    // Search filter (partial case-insensitive on fullName, email, phoneNumber, parentPhoneNumber)
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
        { parentPhoneNumber: { contains: search, mode: 'insensitive' } },
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
          parentPhoneNumber: true,
          deviceId: true,
          profilePictureUrl: true,
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
          otherUniversityName: true,
          otherFacultyName: true,
          otherDepartmentName: true,
          otherProgramName: true,
          academicUniversity: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
          academicFaculty: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
          academicDepartment: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
          academicProgram: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async getStudentStats() {
    const students = await this.prisma.user.findMany({
      where: { role: 'STUDENT', deletedAt: null },
      select: {
        educationLevel: true,
        highSchoolSystem: true,
        highSchoolGrade: true,
        traditionalBranch: true,
        baccalaureatePath: true,
        studyMode: true,
        studyLanguage: true,
        otherUniversityName: true,
        otherFacultyName: true,
        otherDepartmentName: true,
        otherProgramName: true,
        academicUniversity: { select: { nameEn: true, nameAr: true, isOther: true } },
        academicFaculty: { select: { nameEn: true, nameAr: true, isOther: true } },
        academicDepartment: { select: { nameEn: true, nameAr: true, isOther: true } },
        academicProgram: { select: { nameEn: true, nameAr: true, isOther: true } },
      }
    });

    const totalStudents = students.length;
    let highSchoolTotal = 0;
    let universityTotal = 0;

    const highSchoolBreakdown = {
      system: {} as Record<string, number>,
      grade: {} as Record<string, number>,
      branch: {} as Record<string, number>,
      path: {} as Record<string, number>,
    };

    const universityBreakdown = {
      university: {} as Record<string, number>,
      faculty: {} as Record<string, number>,
      department: {} as Record<string, number>,
      program: {} as Record<string, number>,
    };

    for (const student of students) {
      if (student.educationLevel === 'HIGH_SCHOOL') {
        highSchoolTotal++;
        if (student.highSchoolSystem) {
          highSchoolBreakdown.system[student.highSchoolSystem] = (highSchoolBreakdown.system[student.highSchoolSystem] || 0) + 1;
        }
        if (student.highSchoolGrade) {
          highSchoolBreakdown.grade[student.highSchoolGrade] = (highSchoolBreakdown.grade[student.highSchoolGrade] || 0) + 1;
        }
        if (student.traditionalBranch) {
          highSchoolBreakdown.branch[student.traditionalBranch] = (highSchoolBreakdown.branch[student.traditionalBranch] || 0) + 1;
        }
        if (student.baccalaureatePath) {
          highSchoolBreakdown.path[student.baccalaureatePath] = (highSchoolBreakdown.path[student.baccalaureatePath] || 0) + 1;
        }
      } else if (student.educationLevel === 'UNIVERSITY') {
        universityTotal++;
        const uniName = student.academicUniversity?.nameAr || student.academicUniversity?.nameEn || student.otherUniversityName || 'Unknown';
        universityBreakdown.university[uniName] = (universityBreakdown.university[uniName] || 0) + 1;

        const facName = student.academicFaculty?.nameAr || student.academicFaculty?.nameEn || student.otherFacultyName || 'Unknown';
        universityBreakdown.faculty[facName] = (universityBreakdown.faculty[facName] || 0) + 1;

        const depName = student.academicDepartment?.nameAr || student.academicDepartment?.nameEn || student.otherDepartmentName || 'Unknown';
        if (depName !== 'Unknown') {
          universityBreakdown.department[depName] = (universityBreakdown.department[depName] || 0) + 1;
        }

        const progName = student.academicProgram?.nameAr || student.academicProgram?.nameEn || student.otherProgramName || 'Unknown';
        if (progName !== 'Unknown') {
          universityBreakdown.program[progName] = (universityBreakdown.program[progName] || 0) + 1;
        }
      }
    }

    return {
      totalStudents,
      highSchoolTotal,
      universityTotal,
      highSchoolBreakdown,
      universityBreakdown,
    };
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
        isDemo: true,
        educationLevel: true,
        phoneNumber: true,
        parentPhoneNumber: true,
        profilePictureUrl: true,
        xp: true,
        streakDays: true,
        deviceId: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
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
        otherUniversityName: true,
        otherFacultyName: true,
        otherDepartmentName: true,
        otherProgramName: true,
        academicUniversity: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
        academicFaculty: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
        academicDepartment: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
        academicProgram: { select: { id: true, nameAr: true, nameEn: true, isOther: true } },
        riskProfile: true,
        _count: {
          select: {
            accessedCourses: true,
            accessedLectures: true,
            quizAttempts: true,
            examAttempts: true,
            deviceSessions: true,
            certificates: true,
            redeemedCodes: true,
            playbackSessions: true,
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

    if (data.educationLevel && data.educationLevel !== user.educationLevel) {
      normalizeEducationProfile(data as any);
    }

    try {
      return await this.prisma.user.update({
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
    } catch (error: any) {
      if (error?.code === 'P2002' && error?.meta?.target?.includes('email')) {
        throw new BadRequestException('Email is already in use by another account.');
      }
      throw error;
    }
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        deletedAt: new Date(),
        email: `${user.email}_deleted_${Date.now()}`,
        phoneNumber: user.phoneNumber ? `${user.phoneNumber}_del_${Date.now()}` : null
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

  async resetPassword(userId: string, newPassword: string, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { 
          password: hashedPassword,
          refreshToken: null
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'ADMIN_RESET_PASSWORD',
          entity: 'User',
          entityId: userId,
          details: JSON.stringify({ message: `Admin reset password for user ${userId}` }),
        },
      });
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
      data: { expiresAt: new Date(0), deletedAt: null },
    });
    return { message: 'Lecture access revoked successfully' };
  }

  async removeCourseAccess(studentId: string, courseId: string) {
    await this.prisma.studentCourseAccess.updateMany({
      where: { studentId, courseId },
      data: { expiresAt: new Date(0), deletedAt: null },
    });
    return { message: 'Course access revoked successfully' };
  }

  /**
   * Relock a whole course for ALL students (e.g. at the start of a new term / after the midterm).
   *
   * Removes every access grant tied to this course so each student must redeem a NEW code:
   *  - course access (COURSE codes / admin grants)
   *  - per-lecture access (LECTURE codes, and the rows auto-created when a course-access student opened a lecture)
   *  - file access (FILE / COURSE_FILES codes / admin grants) for this course's attachments
   *
   * Learning progress (session completion, quiz/exam attempts, view usage, XP, certificates) is NOT touched.
   * Previously redeemed codes stay REDEEMED, so they cannot be reused.
   *
   * Rows are hard-deleted on purpose: the (studentId, courseId) / (studentId, lectureId) unique
   * constraints would otherwise block the student from redeeming a new code.
   *
   * A full snapshot of the removed rows is stored in SystemAuditLog (actionType COURSE_RELOCKED)
   * inside the same transaction, so an accidental relock can be undone via restoreCourseRelock().
   */
  async relockCourse(courseId: string, actorId: string, ipAddress?: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const fileAccessWhere = {
      OR: [
        { courseId },
        { attachment: { lecture: { courseId } } },
      ],
    };

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Snapshot everything we're about to remove (used for undo)
      const [courseRows, lectureRows, fileRows] = await Promise.all([
        tx.studentCourseAccess.findMany({ where: { courseId } }),
        tx.studentLectureAccess.findMany({ where: { lecture: { courseId } } }),
        tx.studentFileAccess.findMany({ where: fileAccessWhere }),
      ]);

      // 2. Record a REVOKED entry in each affected code's history (code itself stays REDEEMED)
      const affectedCodes = await tx.activationCode.findMany({
        where: {
          status: CodeStatus.REDEEMED,
          OR: [
            { redeemedCourseId: courseId },
            { redeemedLecture: { courseId } },
            { redeemedAttachment: { lecture: { courseId } } },
          ],
        },
        select: { id: true, code: true, studentId: true, redeemedCourseId: true, redeemedLectureId: true, redeemedAttachmentId: true },
      });

      if (affectedCodes.length > 0) {
        await tx.activationCodeHistory.createMany({
          data: affectedCodes.map((c) => ({
            codeId: c.id,
            code: c.code,
            redeemedCourseId: c.redeemedCourseId,
            redeemedLectureId: c.redeemedLectureId,
            redeemedAttachmentId: c.redeemedAttachmentId,
            studentId: c.studentId,
            action: 'REVOKED',
            oldStatus: CodeStatus.REDEEMED,
            newStatus: CodeStatus.REDEEMED,
            actorId,
            ipAddress: ipAddress ?? null,
          })),
        });
      }

      // 3. Remove access
      const courseAccess = await tx.studentCourseAccess.deleteMany({ where: { courseId } });
      const lectureAccess = await tx.studentLectureAccess.deleteMany({ where: { lecture: { courseId } } });
      const fileAccess = await tx.studentFileAccess.deleteMany({ where: fileAccessWhere });

      const counts = {
        courseAccessRemoved: courseAccess.count,
        lectureAccessRemoved: lectureAccess.count,
        fileAccessRemoved: fileAccess.count,
        codesRevoked: affectedCodes.length,
      };

      // 4. Persist the snapshot atomically with the delete — if this fails, nothing is removed
      const log = await tx.systemAuditLog.create({
        data: {
          actorId,
          actionType: 'COURSE_RELOCKED',
          payload: JSON.stringify({
            version: 2,
            courseId,
            courseTitle: course.title,
            ...counts,
            restoredAt: null,
            snapshot: {
              courseAccess: courseRows,
              lectureAccess: lectureRows,
              fileAccess: fileRows,
            },
          }),
          ipAddress: ipAddress ?? null,
        },
      });

      return { relockId: log.id, ...counts };
    }, { timeout: 120000 });

    return {
      message: `Course "${course.title}" has been relocked. Students must redeem a new code to regain access.`,
      ...result,
    };
  }

  /** List past relocks of a course (newest first), without the heavy snapshot data. */
  async getCourseRelocks(courseId: string) {
    const logs = await this.prisma.systemAuditLog.findMany({
      where: { actionType: 'COURSE_RELOCKED', payload: { contains: courseId } },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { fullName: true, email: true } } },
    });

    return logs
      .map((log) => {
        const p = this.parseRelockPayload(log.payload);
        if (!p || p.courseId !== courseId) return null;
        return {
          id: log.id,
          createdAt: log.createdAt,
          actorName: log.actor?.fullName ?? null,
          courseAccessRemoved: p.courseAccessRemoved ?? 0,
          lectureAccessRemoved: p.lectureAccessRemoved ?? 0,
          fileAccessRemoved: p.fileAccessRemoved ?? 0,
          codesRevoked: p.codesRevoked ?? 0,
          // Relocks made before snapshots existed can only be rebuilt from activation-code history
          restoreMode: p.snapshot ? 'EXACT' : 'FROM_CODES',
          restoredAt: p.restoredAt ?? null,
        };
      })
      .filter(Boolean);
  }

  /**
   * Undo a relock: give access back ONLY to the students who had it before that relock.
   * Students who already redeemed a new code in the meantime keep their new access (duplicates are skipped).
   */
  async restoreCourseRelock(relockId: string, actorId: string, ipAddress?: string) {
    const log = await this.prisma.systemAuditLog.findUnique({ where: { id: relockId } });
    if (!log || log.actionType !== 'COURSE_RELOCKED') throw new NotFoundException('Relock record not found');

    const payload = this.parseRelockPayload(log.payload);
    if (!payload?.courseId) throw new BadRequestException('Relock record is unreadable');
    if (payload.restoredAt) throw new BadRequestException('This relock has already been restored');

    const course = await this.prisma.course.findUnique({ where: { id: payload.courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const toDate = (v: any) => (v ? new Date(v) : null);

    const result = await this.prisma.$transaction(async (tx) => {
      let courseRows: any[] = [];
      let lectureRows: any[] = [];
      let fileRows: any[] = [];

      if (payload.snapshot) {
        // EXACT restore from snapshot (original timers / expiry dates preserved)
        courseRows = (payload.snapshot.courseAccess ?? []).map((r: any) => ({
          studentId: r.studentId,
          courseId: r.courseId,
          createdAt: toDate(r.createdAt) ?? new Date(),
          activatedAt: toDate(r.activatedAt) ?? new Date(),
          expiresAt: toDate(r.expiresAt),
        }));
        lectureRows = (payload.snapshot.lectureAccess ?? []).map((r: any) => ({
          studentId: r.studentId,
          lectureId: r.lectureId,
          createdAt: toDate(r.createdAt) ?? new Date(),
          isStarted: !!r.isStarted,
          activatedAt: toDate(r.activatedAt),
          expiresAt: toDate(r.expiresAt),
          timerPausedAt: toDate(r.timerPausedAt),
        }));
        fileRows = (payload.snapshot.fileAccess ?? []).map((r: any) => ({
          studentId: r.studentId,
          attachmentId: r.attachmentId ?? null,
          courseId: r.courseId ?? null,
          source: r.source,
          createdAt: toDate(r.createdAt) ?? new Date(),
        }));
      } else {
        // FROM_CODES: legacy relock that ran BEFORE snapshots were added.
        // 1) Rebuild course, lecture, and file access from all redeemed ActivationCodes for this course
        const redeemedCodes = await tx.activationCode.findMany({
          where: {
            status: CodeStatus.REDEEMED,
            studentId: { not: null },
            OR: [
              { redeemedCourseId: course.id },
              { redeemedLecture: { courseId: course.id } },
              { redeemedAttachment: { lecture: { courseId: course.id } } },
            ],
          },
          select: {
            studentId: true,
            targetType: true,
            redeemedAt: true,
            redeemedCourseId: true,
            redeemedLectureId: true,
            redeemedAttachmentId: true,
          },
        });

        const studentsWithAnyCode = new Set<string>();
        for (const c of redeemedCodes) {
          if (!c.studentId) continue;
          studentsWithAnyCode.add(c.studentId);
          const redeemedAt = c.redeemedAt ?? new Date();
          if (c.targetType === 'COURSE' && c.redeemedCourseId) {
            courseRows.push({
              studentId: c.studentId,
              courseId: c.redeemedCourseId,
              activatedAt: redeemedAt,
              expiresAt:
                course.validityDays && course.validityDays > 0
                  ? new Date(redeemedAt.getTime() + course.validityDays * 86400000)
                  : null,
            });
          } else if (c.targetType === 'LECTURE' && c.redeemedLectureId) {
            lectureRows.push({
              studentId: c.studentId,
              lectureId: c.redeemedLectureId,
              isStarted: false,
            });
          } else if (c.targetType === 'FILE' && c.redeemedAttachmentId) {
            fileRows.push({
              studentId: c.studentId,
              attachmentId: c.redeemedAttachmentId,
              courseId: null,
              source: 'FILE_CODE',
            });
          } else if (c.targetType === 'COURSE_FILES' && c.redeemedCourseId) {
            fileRows.push({
              studentId: c.studentId,
              attachmentId: null,
              courseId: c.redeemedCourseId,
              source: 'COURSE_FILES_CODE',
            });
          }
        }

        // 2) Also recover lecture access for lectures students had already started (via view usage or session progress)
        //    and recover course access for any student who was manually granted access by an admin (activity in course, no code)
        const [viewUsages, sessionProg] = await Promise.all([
          tx.studentSessionViewUsage.findMany({
            where: { session: { lecture: { courseId: course.id } } },
            select: { studentId: true, session: { select: { lectureId: true } } },
          }),
          tx.sessionProgress.findMany({
            where: { session: { lecture: { courseId: course.id } } },
            select: { studentId: true, session: { select: { lectureId: true } } },
          }),
        ]);

        for (const item of [...viewUsages, ...sessionProg]) {
          lectureRows.push({
            studentId: item.studentId,
            lectureId: item.session.lectureId,
            isStarted: true,
            activatedAt: new Date(),
          });
          if (!studentsWithAnyCode.has(item.studentId)) {
            courseRows.push({
              studentId: item.studentId,
              courseId: course.id,
              activatedAt: new Date(),
              expiresAt: null,
            });
          }
        }
      }

      // Skip students who already have access again (e.g. redeemed a new code after the relock)
      const courseRes = courseRows.length
        ? await tx.studentCourseAccess.createMany({ data: courseRows, skipDuplicates: true })
        : { count: 0 };
      const lectureRes = lectureRows.length
        ? await tx.studentLectureAccess.createMany({ data: lectureRows, skipDuplicates: true })
        : { count: 0 };

      // File access has no unique constraint — dedupe manually
      const existingFiles = await tx.studentFileAccess.findMany({
        where: { studentId: { in: [...new Set(fileRows.map((r) => r.studentId))] } },
        select: { studentId: true, attachmentId: true, courseId: true },
      });
      const key = (r: any) => `${r.studentId}|${r.attachmentId ?? ''}|${r.courseId ?? ''}`;
      const seen = new Set(existingFiles.map(key));
      const newFileRows = fileRows.filter((r) => {
        const k = key(r);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const fileRes = newFileRows.length
        ? await tx.studentFileAccess.createMany({ data: newFileRows })
        : { count: 0 };

      // Mark the relock as restored so it can't be applied twice
      await tx.systemAuditLog.update({
        where: { id: log.id },
        data: {
          payload: JSON.stringify({ ...payload, restoredAt: new Date().toISOString(), restoredBy: actorId }),
        },
      });

      const counts = {
        courseAccessRestored: courseRes.count,
        lectureAccessRestored: lectureRes.count,
        fileAccessRestored: fileRes.count,
      };

      await tx.systemAuditLog.create({
        data: {
          actorId,
          actionType: 'COURSE_RELOCK_RESTORED',
          payload: JSON.stringify({ courseId: course.id, courseTitle: course.title, relockId, mode: payload.snapshot ? 'EXACT' : 'FROM_CODES', ...counts }),
          ipAddress: ipAddress ?? null,
        },
      });

      return counts;
    }, { timeout: 120000 });

    return {
      message: `Access to "${course.title}" restored for previously enrolled students.`,
      mode: payload.snapshot ? 'EXACT' : 'FROM_CODES',
      ...result,
    };
  }

  private parseRelockPayload(payload: string | null): any {
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
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
    // Strip heavy relock snapshots from the audit viewer output
    const cleaned = items.map((item: any) => {
      if (item.actionType !== 'COURSE_RELOCKED') return item;
      const p = this.parseRelockPayload(item.payload);
      if (!p?.snapshot) return item;
      const { snapshot, ...rest } = p;
      return { ...item, payload: JSON.stringify(rest) };
    });
    return { items: cleaned, total, skip, take };
  }

  async getStudentProgress(studentId: string) {
    const [
      student,
      courseAccesses,
      lectures,
      sessionViews,
      playbackSessions,
      sessionProgress,
      quizAttempts,
      examAttempts,
      redeemedCodes,
      codeHistory,
      fileAccesses,
      deviceHistory,
      deviceSessions,
      certificates,
      badges,
      adminAuditLogs,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          parentPhoneNumber: true,
          educationLevel: true,
          createdAt: true,
          lastLoginAt: true,
          isActive: true,
          isDemo: true,
          xp: true,
          streakDays: true,
          deviceId: true,
        },
      }),
      this.prisma.studentCourseAccess.findMany({
        where: { studentId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              type: true,
              isFree: true,
              validityDays: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentLectureAccess.findMany({
        where: { studentId },
        include: {
          lecture: {
            include: {
              course: { select: { id: true, title: true, isFree: true } },
              chapter: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentSessionViewUsage.findMany({
        where: { studentId },
        include: {
          session: {
            select: {
              id: true,
              title: true,
              duration: true,
              sortOrder: true,
              lecture: {
                select: {
                  id: true,
                  title: true,
                  maxViews: true,
                  chapter: { select: { id: true, title: true } },
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.playbackSession.findMany({
        where: { studentId },
        include: {
          videoSession: {
            select: {
              id: true,
              title: true,
              duration: true,
              sortOrder: true,
              lecture: {
                select: {
                  id: true,
                  title: true,
                  maxViews: true,
                  chapter: { select: { id: true, title: true } },
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.sessionProgress.findMany({
        where: { studentId },
        include: {
          session: {
            select: {
              id: true,
              title: true,
              duration: true,
              sortOrder: true,
              lecture: {
                select: {
                  id: true,
                  title: true,
                  maxViews: true,
                  chapter: { select: { id: true, title: true } },
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId },
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              passGrade: true,
              maxAttempts: true,
              lecture: {
                select: {
                  id: true,
                  title: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
          responses: { select: { earnedPoints: true, questionPoints: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.examAttempt.findMany({
        where: { studentId },
        include: {
          exam: {
            select: {
              id: true,
              title: true,
              passGrade: true,
              maxAttempts: true,
              course: { select: { id: true, title: true } },
              lecture: {
                select: {
                  id: true,
                  title: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
          responses: { select: { earnedPoints: true, question: { select: { points: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activationCode.findMany({
        where: { studentId },
        include: {
          redeemedLecture: {
            select: { id: true, title: true, course: { select: { id: true, title: true } } },
          },
          redeemedCourse: { select: { id: true, title: true } },
          redeemedAttachment: {
            select: {
              id: true,
              title: true,
              lecture: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
            },
          },
        },
        orderBy: { redeemedAt: 'desc' },
      }),
      this.prisma.activationCodeHistory.findMany({
        where: { studentId },
        include: {
          redeemedLecture: {
            select: { id: true, title: true, course: { select: { id: true, title: true } } },
          },
          redeemedCourse: { select: { id: true, title: true } },
          redeemedAttachment: {
            select: {
              id: true,
              title: true,
              lecture: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
            },
          },
          actor: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentFileAccess.findMany({
        where: { studentId },
        include: {
          attachment: {
            select: {
              id: true,
              title: true,
              type: true,
              lecture: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
            },
          },
          course: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deviceHistory.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deviceSession.findMany({
        where: { studentId },
        orderBy: { lastLoginAt: 'desc' },
      }),
      this.prisma.certificate.findMany({
        where: { studentId },
        include: { course: { select: { id: true, title: true } } },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.studentBadge.findMany({
        where: { studentId },
        include: { badge: true },
        orderBy: { earnedAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { entityId: studentId },
            { details: { contains: studentId } },
          ],
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build lookup maps
    const courseAccessMap = new Map(courseAccesses.map((ca) => [ca.courseId, ca]));
    const lectureAccessMap = new Map(lectures.map((la) => [la.lectureId, la]));
    const usageMap = new Map(sessionViews.map((sv) => [sv.sessionId, sv]));
    const progressMap = new Map(sessionProgress.map((sp) => [sp.sessionId, sp]));

    const playbacksBySessionMap = new Map<string, typeof playbackSessions>();
    for (const ps of playbackSessions) {
      const list = playbacksBySessionMap.get(ps.sessionId) || [];
      list.push(ps);
      playbacksBySessionMap.set(ps.sessionId, list);
    }

    // Collect all touched courseIds
    const touchedCourseIds = new Set<string>();
    for (const ca of courseAccesses) if (ca.courseId) touchedCourseIds.add(ca.courseId);
    for (const la of lectures) if (la.lecture?.course?.id) touchedCourseIds.add(la.lecture.course.id);
    for (const sv of sessionViews) if (sv.session?.lecture?.course?.id) touchedCourseIds.add(sv.session.lecture.course.id);
    for (const ps of playbackSessions) if (ps.videoSession?.lecture?.course?.id) touchedCourseIds.add(ps.videoSession.lecture.course.id);
    for (const sp of sessionProgress) if (sp.session?.lecture?.course?.id) touchedCourseIds.add(sp.session.lecture.course.id);
    for (const qa of quizAttempts) if (qa.quiz?.lecture?.course?.id) touchedCourseIds.add(qa.quiz.lecture.course.id);
    for (const ea of examAttempts) {
      if (ea.exam?.course?.id) touchedCourseIds.add(ea.exam.course.id);
      if (ea.exam?.lecture?.course?.id) touchedCourseIds.add(ea.exam.lecture.course.id);
    }
    for (const rc of redeemedCodes) {
      if (rc.redeemedCourseId) touchedCourseIds.add(rc.redeemedCourseId);
      if (rc.redeemedLecture?.course?.id) touchedCourseIds.add(rc.redeemedLecture.course.id);
    }
    for (const fa of fileAccesses) {
      if (fa.courseId) touchedCourseIds.add(fa.courseId);
      if (fa.attachment?.lecture?.course?.id) touchedCourseIds.add(fa.attachment.lecture.course.id);
    }
    for (const cert of certificates) if (cert.courseId) touchedCourseIds.add(cert.courseId);

    const relevantCourses = touchedCourseIds.size > 0
      ? await this.prisma.course.findMany({
          where: { id: { in: Array.from(touchedCourseIds) } },
          include: {
            lectures: {
              orderBy: { sortOrder: 'asc' },
              include: {
                chapter: { select: { id: true, title: true, orderIndex: true } },
                sessions: {
                  orderBy: { sortOrder: 'asc' },
                },
                quizzes: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, title: true, passGrade: true, maxAttempts: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const visitedSessionIds = new Set<string>();
    const allVideosWatched: any[] = [];

    const coursesHistory = relevantCourses.map((course) => {
      const ca = courseAccessMap.get(course.id);
      const now = new Date();
      const courseCodes = redeemedCodes
        .filter((rc) => rc.redeemedCourseId === course.id)
        .map((rc) => ({
          id: rc.id,
          code: rc.code,
          targetType: rc.targetType,
          redeemedAt: rc.redeemedAt || rc.createdAt,
        }));

      let unlockedLecturesCount = 0;
      let startedLecturesCount = 0;
      let totalVideosInCourse = 0;
      let watchedVideosCount = 0;
      let completedVideosCount = 0;
      let totalVideoWatchesCount = 0;
      let totalStreamOpensCount = 0;

      const courseLectures = course.lectures.map((lec) => {
        const la = lectureAccessMap.get(lec.id);
        const lectureCodes = redeemedCodes
          .filter((rc) => rc.redeemedLectureId === lec.id)
          .map((rc) => ({
            id: rc.id,
            code: rc.code,
            targetType: rc.targetType,
            redeemedAt: rc.redeemedAt || rc.createdAt,
          }));

        let lectureWatchedVideos = 0;
        let lectureCompletedVideos = 0;
        let lectureTotalWatches = 0;
        let lectureTotalStreamOpens = 0;

        const videos = lec.sessions.map((s) => {
          visitedSessionIds.add(s.id);
          const usage = usageMap.get(s.id);
          const prog = progressMap.get(s.id);
          const playbacks = playbacksBySessionMap.get(s.id) || [];

          const usedViews = usage?.usedViews ?? 0;
          const grantedViews = usage?.grantedViews ?? 0;
          const maxViews = lec.maxViews ?? null;
          const effectiveMaxViews = maxViews !== null ? maxViews + grantedViews : null;
          const remainingViews = effectiveMaxViews !== null ? Math.max(0, effectiveMaxViews - usedViews) : null;
          const streamOpensCount = playbacks.length;
          const consumedPlaybacksCount = playbacks.filter((p) => p.consumed).length;
          const watchCount = Math.max(usedViews, consumedPlaybacksCount);
          const isCompleted = Boolean(prog?.isCompleted);
          const isWatched = watchCount > 0 || streamOpensCount > 0 || isCompleted;

          const firstWatchedAt =
            playbacks.length > 0
              ? playbacks[0].createdAt
              : usage
                ? usage.createdAt
                : isCompleted
                  ? prog?.createdAt || null
                  : null;
          const lastWatchedAt =
            playbacks.length > 0
              ? playbacks[playbacks.length - 1].createdAt
              : usage
                ? usage.updatedAt
                : isCompleted
                  ? prog?.completedAt || prog?.updatedAt || null
                  : null;

          const playbackLogs = playbacks.map((p, idx) => ({
            index: idx + 1,
            id: p.id,
            openedAt: p.createdAt,
            consumed: p.consumed,
            expiresAt: p.expiresAt,
          }));

          totalVideosInCourse++;
          if (isWatched) {
            watchedVideosCount++;
            lectureWatchedVideos++;
          }
          if (isCompleted) {
            completedVideosCount++;
            lectureCompletedVideos++;
          }
          totalVideoWatchesCount += watchCount;
          lectureTotalWatches += watchCount;
          totalStreamOpensCount += streamOpensCount;
          lectureTotalStreamOpens += streamOpensCount;

          const videoRecord = {
            sessionId: s.id,
            sessionTitle: s.title,
            duration: s.duration,
            hasVideo: Boolean(s.videoUrl || s.videoMediaId),
            lectureId: lec.id,
            lectureTitle: lec.title,
            chapterTitle: lec.chapter?.title || null,
            courseId: course.id,
            courseTitle: course.title,
            usedViews,
            grantedViews,
            maxViews,
            effectiveMaxViews,
            remainingViews,
            streamOpensCount,
            consumedPlaybacksCount,
            watchCount,
            isWatched,
            isCompleted,
            completedAt: prog?.completedAt || null,
            firstWatchedAt,
            lastWatchedAt,
            playbackLogs,
          };

          if (isWatched || usage) {
            allVideosWatched.push(videoRecord);
          }

          return videoRecord;
        });

        const lectureQuizAttempts = quizAttempts.filter((qa) => qa.quiz?.lecture?.id === lec.id);
        const quizzes = lec.quizzes.map((q) => {
          const attemptsForQuiz = lectureQuizAttempts.filter((a) => a.quizId === q.id);
          const bestScore = attemptsForQuiz.length > 0 ? Math.max(...attemptsForQuiz.map((a) => a.score)) : null;
          const isPassed = attemptsForQuiz.some((a) => a.status === 'PASSED');
          return {
            quizId: q.id,
            quizTitle: q.title,
            passGrade: q.passGrade,
            maxAttempts: q.maxAttempts,
            attemptsCount: attemptsForQuiz.length,
            bestScore,
            isPassed,
          };
        });

        const hasActivity = lectureWatchedVideos > 0 || lectureCompletedVideos > 0 || lectureQuizAttempts.length > 0 || lectureCodes.length > 0;
        const isUnlocked = Boolean(la || ca || course.isFree || hasActivity);
        const isStarted = Boolean(la?.isStarted || (ca && lectureWatchedVideos > 0) || (course.isFree && lectureWatchedVideos > 0));
        const unlockedAt = la?.createdAt || ca?.createdAt || null;
        const activatedAt = la?.activatedAt || ca?.activatedAt || null;
        const expiresAt = la?.expiresAt || ca?.expiresAt || null;
        const isExpired = Boolean(expiresAt && new Date(expiresAt) < now);

        if (isUnlocked) unlockedLecturesCount++;
        if (isStarted) startedLecturesCount++;

        return {
          lectureId: lec.id,
          lectureTitle: lec.title,
          chapterId: lec.chapter?.id || null,
          chapterTitle: lec.chapter?.title || null,
          maxViews: lec.maxViews,
          validityDays: lec.validityDays,
          durationDays: lec.durationDays,
          durationHours: lec.durationHours,
          durationMinutes: lec.durationMinutes,
          isUnlocked,
          isStarted,
          unlockedAt,
          activatedAt,
          expiresAt,
          timerPausedAt: la?.timerPausedAt || null,
          isExpired,
          codesUsed: lectureCodes,
          totalVideosCount: videos.length,
          watchedVideosCount: lectureWatchedVideos,
          completedVideosCount: lectureCompletedVideos,
          totalWatchesCount: lectureTotalWatches,
          totalStreamOpensCount: lectureTotalStreamOpens,
          videos,
          quizzes,
        };
      });

      const hasDirectCourseAccess = Boolean(ca);
      const courseExpiresAt = ca?.expiresAt || null;
      const isCourseExpired = Boolean(courseExpiresAt && new Date(courseExpiresAt) < now);

      return {
        courseId: course.id,
        courseTitle: course.title,
        isFree: course.isFree,
        type: course.type,
        hasDirectCourseAccess,
        unlockedAt: ca?.createdAt || null,
        activatedAt: ca?.activatedAt || null,
        expiresAt: courseExpiresAt,
        isExpired: isCourseExpired,
        codesUsed: courseCodes,
        totalLecturesCount: courseLectures.length,
        unlockedLecturesCount,
        startedLecturesCount,
        totalVideosCount: totalVideosInCourse,
        watchedVideosCount,
        completedVideosCount,
        totalVideoWatchesCount,
        totalStreamOpensCount,
        lectures: courseLectures,
      };
    });

    // Ensure any orphaned/soft-deleted session with view usage or playback is also in allVideosWatched
    for (const sv of sessionViews) {
      if (!visitedSessionIds.has(sv.sessionId)) {
        visitedSessionIds.add(sv.sessionId);
        const playbacks = playbacksBySessionMap.get(sv.sessionId) || [];
        const prog = progressMap.get(sv.sessionId);
        const maxViews = sv.session.lecture.maxViews ?? null;
        const effectiveMaxViews = maxViews !== null ? maxViews + sv.grantedViews : null;
        const remainingViews = effectiveMaxViews !== null ? Math.max(0, effectiveMaxViews - sv.usedViews) : null;
        const streamOpensCount = playbacks.length;
        const consumedPlaybacksCount = playbacks.filter((p) => p.consumed).length;
        const watchCount = Math.max(sv.usedViews, consumedPlaybacksCount);
        const isCompleted = Boolean(prog?.isCompleted);
        allVideosWatched.push({
          sessionId: sv.sessionId,
          sessionTitle: sv.session.title,
          duration: sv.session.duration,
          hasVideo: true,
          lectureId: sv.session.lecture.id,
          lectureTitle: sv.session.lecture.title,
          chapterTitle: sv.session.lecture.chapter?.title || null,
          courseId: sv.session.lecture.course.id,
          courseTitle: sv.session.lecture.course.title,
          usedViews: sv.usedViews,
          grantedViews: sv.grantedViews,
          maxViews,
          effectiveMaxViews,
          remainingViews,
          streamOpensCount,
          consumedPlaybacksCount,
          watchCount,
          isWatched: true,
          isCompleted,
          completedAt: prog?.completedAt || null,
          firstWatchedAt: playbacks[0]?.createdAt || sv.createdAt,
          lastWatchedAt: playbacks[playbacks.length - 1]?.createdAt || sv.updatedAt,
          playbackLogs: playbacks.map((p, idx) => ({
            index: idx + 1,
            id: p.id,
            openedAt: p.createdAt,
            consumed: p.consumed,
            expiresAt: p.expiresAt,
          })),
        });
      }
    }

    const mappedQuizAttempts = quizAttempts.map((a) => {
      let earnedPoints = 0;
      let totalPoints = 0;
      for (const r of a.responses) {
        if (r.earnedPoints != null) earnedPoints += r.earnedPoints;
        if (r.questionPoints != null) totalPoints += r.questionPoints;
      }
      return {
        attemptId: a.id,
        quizId: a.quizId,
        quizTitle: a.quiz?.title,
        lectureId: a.quiz?.lecture?.id || null,
        lectureTitle: a.quiz?.lecture?.title || null,
        courseId: a.quiz?.lecture?.course?.id || null,
        courseTitle: a.quiz?.lecture?.course?.title || null,
        score: a.score,
        status: a.status,
        passGrade: a.quiz?.passGrade,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        createdAt: a.createdAt,
        earnedPoints,
        totalPoints,
      };
    });

    const mappedExamAttempts = examAttempts.map((a) => {
      let earnedPoints = 0;
      let totalPoints = 0;
      for (const r of a.responses) {
        if (r.earnedPoints != null) earnedPoints += r.earnedPoints;
        if (r.question?.points != null) totalPoints += r.question.points;
      }
      return {
        attemptId: a.id,
        examId: a.examId,
        examTitle: a.exam?.title,
        courseId: a.exam?.course?.id || a.exam?.lecture?.course?.id || null,
        courseTitle: a.exam?.course?.title || a.exam?.lecture?.course?.title || null,
        lectureTitle: a.exam?.lecture?.title || null,
        score: a.score,
        status: a.status,
        passGrade: a.exam?.passGrade,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        createdAt: a.createdAt,
        earnedPoints,
        totalPoints,
      };
    });

    // Build complete chronological timeline from registration to now
    const timeline: Array<{
      id: string;
      timestamp: Date | string;
      category:
        | 'REGISTRATION'
        | 'COURSE_ACCESS'
        | 'LECTURE_ACCESS'
        | 'CODE_REDEMPTION'
        | 'VIDEO_WATCH'
        | 'VIDEO_COMPLETE'
        | 'QUIZ_ATTEMPT'
        | 'EXAM_ATTEMPT'
        | 'FILE_ACCESS'
        | 'DEVICE_EVENT'
        | 'ADMIN_ACTION'
        | 'CERTIFICATE'
        | 'BADGE';
      action: string;
      title: string;
      details: string;
    }> = [];

    if (student?.createdAt) {
      timeline.push({
        id: `reg_${student.id}`,
        timestamp: student.createdAt,
        category: 'REGISTRATION',
        action: 'ACCOUNT_REGISTERED',
        title: `Student Account Registered (${student.fullName})`,
        details: `Email: ${student.email}${student.phoneNumber ? ` | Phone: ${student.phoneNumber}` : ''} | Level: ${student.educationLevel}`,
      });
    }

    for (const ch of codeHistory) {
      const targetName =
        ch.redeemedCourse?.title ||
        (ch.redeemedLecture ? `${ch.redeemedLecture.title} (${ch.redeemedLecture.course?.title || ''})` : '') ||
        ch.redeemedAttachment?.title ||
        'Content';
      timeline.push({
        id: `code_hist_${ch.id}`,
        timestamp: ch.createdAt,
        category: 'CODE_REDEMPTION',
        action: `CODE_${ch.action}`,
        title: `Activation Code ${ch.action}: ${ch.code}`,
        details: `Target: ${targetName}${ch.ipAddress ? ` | IP: ${ch.ipAddress}` : ''}`,
      });
    }

    // If there are redeemedCodes without codeHistory entries, add them
    const historyCodeIds = new Set(codeHistory.map((ch) => ch.codeId));
    for (const rc of redeemedCodes) {
      if (!historyCodeIds.has(rc.id) && rc.redeemedAt) {
        const targetName =
          rc.redeemedCourse?.title ||
          (rc.redeemedLecture ? `${rc.redeemedLecture.title} (${rc.redeemedLecture.course?.title || ''})` : '') ||
          rc.redeemedAttachment?.title ||
          'Content';
        timeline.push({
          id: `code_red_${rc.id}`,
          timestamp: rc.redeemedAt,
          category: 'CODE_REDEMPTION',
          action: 'CODE_REDEEMED',
          title: `Activation Code Redeemed: ${rc.code}`,
          details: `Type: ${rc.targetType} | Target: ${targetName}`,
        });
      }
    }

    for (const ca of courseAccesses) {
      timeline.push({
        id: `ca_${ca.id}`,
        timestamp: ca.createdAt,
        category: 'COURSE_ACCESS',
        action: 'COURSE_UNLOCKED',
        title: `Course Access Unlocked: ${ca.course.title}`,
        details: `Activated: ${ca.activatedAt ? new Date(ca.activatedAt).toISOString() : 'Yes'}${ca.expiresAt ? ` | Expires: ${new Date(ca.expiresAt).toISOString()}` : ' | No Expiry'}`,
      });
    }

    for (const la of lectures) {
      timeline.push({
        id: `la_unlock_${la.id}`,
        timestamp: la.createdAt,
        category: 'LECTURE_ACCESS',
        action: 'LECTURE_UNLOCKED',
        title: `Lecture Unlocked: ${la.lecture.title}`,
        details: `Course: ${la.lecture.course.title}${la.lecture.chapter?.title ? ` | Chapter: ${la.lecture.chapter.title}` : ''}`,
      });
      if (la.isStarted && la.activatedAt) {
        timeline.push({
          id: `la_start_${la.id}`,
          timestamp: la.activatedAt,
          category: 'LECTURE_ACCESS',
          action: 'LECTURE_STARTED',
          title: `Lecture Started: ${la.lecture.title}`,
          details: `Course: ${la.lecture.course.title}${la.expiresAt ? ` | Expires At: ${new Date(la.expiresAt).toISOString()}` : ' | Unlimited Time'}`,
        });
      }
    }

    for (const ps of playbackSessions) {
      timeline.push({
        id: `ps_${ps.id}`,
        timestamp: ps.createdAt,
        category: 'VIDEO_WATCH',
        action: ps.consumed ? 'VIDEO_VIEW_CONSUMED' : 'VIDEO_STREAM_OPENED',
        title: `${ps.consumed ? 'Watched Video (Confirmed View)' : 'Opened Video Stream'}: ${ps.videoSession.title}`,
        details: `Lecture: ${ps.videoSession.lecture.title} | Course: ${ps.videoSession.lecture.course.title}`,
      });
    }

    for (const sp of sessionProgress) {
      if (sp.isCompleted) {
        timeline.push({
          id: `sp_${sp.id}`,
          timestamp: sp.completedAt || sp.updatedAt || sp.createdAt,
          category: 'VIDEO_COMPLETE',
          action: 'VIDEO_COMPLETED',
          title: `Completed Video: ${sp.session.title}`,
          details: `Lecture: ${sp.session.lecture.title} | Course: ${sp.session.lecture.course.title}`,
        });
      }
    }

    for (const qa of mappedQuizAttempts) {
      timeline.push({
        id: `qa_${qa.attemptId}`,
        timestamp: qa.submittedAt || qa.startedAt || qa.createdAt,
        category: 'QUIZ_ATTEMPT',
        action: `QUIZ_${qa.status}`,
        title: `Quiz Attempt (${qa.status}): ${qa.quizTitle || 'Quiz'}`,
        details: `Score: ${qa.score}% (${qa.earnedPoints}/${qa.totalPoints} pts)${qa.lectureTitle ? ` | Lecture: ${qa.lectureTitle}` : ''}${qa.courseTitle ? ` | Course: ${qa.courseTitle}` : ''}`,
      });
    }

    for (const ea of mappedExamAttempts) {
      timeline.push({
        id: `ea_${ea.attemptId}`,
        timestamp: ea.submittedAt || ea.startedAt || ea.createdAt,
        category: 'EXAM_ATTEMPT',
        action: `EXAM_${ea.status}`,
        title: `Exam Attempt (${ea.status}): ${ea.examTitle || 'Exam'}`,
        details: `Score: ${ea.score ?? 0}% (${ea.earnedPoints}/${ea.totalPoints} pts)${ea.courseTitle ? ` | Course: ${ea.courseTitle}` : ''}`,
      });
    }

    for (const fa of fileAccesses) {
      timeline.push({
        id: `fa_${fa.id}`,
        timestamp: fa.createdAt,
        category: 'FILE_ACCESS',
        action: 'FILE_ACCESS_GRANTED',
        title: `File Access Unlocked: ${fa.attachment?.title || fa.course?.title || 'Files'}`,
        details: `Source: ${fa.source}${fa.course?.title ? ` | Course: ${fa.course.title}` : ''}`,
      });
    }

    for (const dh of deviceHistory) {
      timeline.push({
        id: `dh_${dh.id}`,
        timestamp: dh.createdAt,
        category: 'DEVICE_EVENT',
        action: `DEVICE_${dh.action}`,
        title: `Device ${dh.action}: ${dh.deviceFingerprint}`,
        details: `${dh.ipAddress ? `IP: ${dh.ipAddress}` : ''}${dh.browser ? ` | Browser: ${dh.browser}` : ''}`,
      });
    }

    for (const al of adminAuditLogs) {
      timeline.push({
        id: `al_${al.id}`,
        timestamp: al.createdAt,
        category: 'ADMIN_ACTION',
        action: al.action,
        title: `Admin Action: ${al.action}`,
        details: `By: ${al.user?.fullName || 'Admin'}${al.details ? ` | ${al.details}` : ''}`,
      });
    }

    for (const cert of certificates) {
      timeline.push({
        id: `cert_${cert.id}`,
        timestamp: cert.issuedAt,
        category: 'CERTIFICATE',
        action: 'CERTIFICATE_ISSUED',
        title: `Certificate Issued: ${cert.course.title}`,
        details: `Course: ${cert.course.title}`,
      });
    }

    for (const b of badges) {
      timeline.push({
        id: `badge_${b.id}`,
        timestamp: b.earnedAt,
        category: 'BADGE',
        action: 'BADGE_EARNED',
        title: `Badge Earned: ${b.badge.name}`,
        details: b.badge.description,
      });
    }

    // Sort timeline chronologically from registration (oldest) to now (newest)
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const totalConfirmedVideoWatches = allVideosWatched.reduce((sum, v) => sum + (v.watchCount || 0), 0);
    const totalVideoStreamOpens = allVideosWatched.reduce((sum, v) => sum + (v.streamOpensCount || 0), 0);
    const totalUniqueVideosWatched = allVideosWatched.filter((v) => v.isWatched).length;
    const totalVideosCompleted = allVideosWatched.filter((v) => v.isCompleted).length;

    const summaryStats = {
      registeredAt: student?.createdAt || null,
      lastLoginAt: student?.lastLoginAt || null,
      reportGeneratedAt: new Date(),
      totalCoursesTouched: coursesHistory.length,
      totalDirectCourseAccesses: courseAccesses.length,
      totalLecturesUnlocked: lectures.length,
      totalLecturesStarted: lectures.filter((l) => l.isStarted).length,
      totalUniqueVideosWatched,
      totalConfirmedVideoWatches,
      totalVideoStreamOpens,
      totalVideosCompleted,
      totalCodesRedeemed: redeemedCodes.length,
      totalQuizAttempts: mappedQuizAttempts.length,
      passedQuizzesCount: mappedQuizAttempts.filter((q) => q.status === 'PASSED').length,
      failedQuizzesCount: mappedQuizAttempts.filter((q) => q.status === 'FAILED').length,
      totalExamAttempts: mappedExamAttempts.length,
      passedExamsCount: mappedExamAttempts.filter((e) => e.status === 'PASSED').length,
      failedExamsCount: mappedExamAttempts.filter((e) => e.status === 'FAILED').length,
      totalDeviceEvents: deviceHistory.length,
      totalFilesUnlocked: fileAccesses.length,
      totalCertificates: certificates.length,
    };

    return {
      summaryStats,
      courseAccesses: courseAccesses.map((ca) => ({
        id: ca.id,
        courseId: ca.courseId,
        courseTitle: ca.course.title,
        isFree: ca.course.isFree,
        createdAt: ca.createdAt,
        activatedAt: ca.activatedAt,
        expiresAt: ca.expiresAt,
      })),
      lectures: lectures.map((l) => ({
        lectureId: l.lectureId,
        lectureTitle: l.lecture.title,
        chapterTitle: l.lecture.chapter?.title || null,
        courseId: l.lecture.course.id,
        courseTitle: l.lecture.course.title,
        isStarted: l.isStarted,
        createdAt: l.createdAt,
        activatedAt: l.activatedAt,
        expiresAt: l.expiresAt,
        timerPausedAt: l.timerPausedAt,
      })),
      sessionViews: sessionViews.map((sv) => {
        const playbacks = playbacksBySessionMap.get(sv.sessionId) || [];
        const prog = progressMap.get(sv.sessionId);
        return {
          sessionId: sv.sessionId,
          sessionTitle: sv.session.title,
          duration: sv.session.duration,
          lectureId: sv.session.lecture.id,
          lectureTitle: sv.session.lecture.title,
          chapterTitle: sv.session.lecture.chapter?.title || null,
          courseId: sv.session.lecture.course.id,
          courseTitle: sv.session.lecture.course.title,
          usedViews: sv.usedViews,
          grantedViews: sv.grantedViews,
          maxViews: sv.session.lecture.maxViews,
          effectiveMaxViews:
            sv.session.lecture.maxViews !== null ? sv.session.lecture.maxViews + sv.grantedViews : null,
          streamOpensCount: playbacks.length,
          consumedPlaybacksCount: playbacks.filter((p) => p.consumed).length,
          isCompleted: Boolean(prog?.isCompleted),
          completedAt: prog?.completedAt || null,
          firstWatchedAt: playbacks[0]?.createdAt || sv.createdAt,
          lastWatchedAt: playbacks[playbacks.length - 1]?.createdAt || sv.updatedAt,
          playbackLogs: playbacks.map((p, idx) => ({
            index: idx + 1,
            id: p.id,
            openedAt: p.createdAt,
            consumed: p.consumed,
            expiresAt: p.expiresAt,
          })),
        };
      }),
      coursesHistory,
      allVideosWatched,
      quizAttempts: mappedQuizAttempts,
      examAttempts: mappedExamAttempts,
      redeemedCodes: redeemedCodes.map((rc) => ({
        id: rc.id,
        code: rc.code,
        status: rc.status,
        targetType: rc.targetType,
        redeemedAt: rc.redeemedAt,
        createdAt: rc.createdAt,
        courseTitle: rc.redeemedCourse?.title || rc.redeemedLecture?.course?.title || rc.redeemedAttachment?.lecture?.course?.title || null,
        lectureTitle: rc.redeemedLecture?.title || rc.redeemedAttachment?.lecture?.title || null,
        attachmentTitle: rc.redeemedAttachment?.title || null,
      })),
      codeHistory: codeHistory.map((ch) => ({
        id: ch.id,
        code: ch.code,
        action: ch.action,
        oldStatus: ch.oldStatus,
        newStatus: ch.newStatus,
        ipAddress: ch.ipAddress,
        browser: ch.browser,
        createdAt: ch.createdAt,
        courseTitle: ch.redeemedCourse?.title || ch.redeemedLecture?.course?.title || ch.redeemedAttachment?.lecture?.course?.title || null,
        lectureTitle: ch.redeemedLecture?.title || ch.redeemedAttachment?.lecture?.title || null,
        attachmentTitle: ch.redeemedAttachment?.title || null,
        actorName: ch.actor?.fullName || null,
      })),
      fileAccesses: fileAccesses.map((fa) => ({
        id: fa.id,
        source: fa.source,
        createdAt: fa.createdAt,
        attachmentTitle: fa.attachment?.title || null,
        attachmentType: fa.attachment?.type || null,
        lectureTitle: fa.attachment?.lecture?.title || null,
        courseTitle: fa.course?.title || fa.attachment?.lecture?.course?.title || null,
      })),
      deviceHistory,
      deviceSessions,
      certificates: certificates.map((c) => ({
        id: c.id,
        courseId: c.courseId,
        courseTitle: c.course.title,
        issuedAt: c.issuedAt,
        pdfUrl: c.pdfUrl,
      })),
      badges: badges.map((b) => ({
        id: b.id,
        badgeId: b.badgeId,
        name: b.badge.name,
        description: b.badge.description,
        earnedAt: b.earnedAt,
      })),
      timeline,
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

  async grantSessionViews(studentId: string, sessionId: string, additionalViews: number, adminId: string) {
    if (additionalViews <= 0 || !Number.isInteger(additionalViews)) {
      throw new BadRequestException('Additional views must be a positive integer.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { lecture: true }
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.lecture.maxViews === null) {
      throw new BadRequestException('This lecture has unlimited views; no grant is necessary.');
    }

    const usage = await this.prisma.studentSessionViewUsage.findUnique({
      where: { studentId_sessionId: { studentId, sessionId } }
    });

    if (!usage) {
       throw new BadRequestException('Student has not started watching this session yet (no usage record found).');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.studentSessionViewUsage.update({
        where: { studentId_sessionId: { studentId, sessionId } },
        data: { grantedViews: { increment: additionalViews } }
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'ADMIN_GRANT_SESSION_VIEWS',
          entity: 'Session',
          entityId: sessionId,
          details: JSON.stringify({ 
            studentId, 
            additionalViewsGranted: additionalViews,
            newTotalGrantedViews: result.grantedViews,
            originalMaxViews: session.lecture.maxViews,
            effectiveLimit: session.lecture.maxViews! + result.grantedViews
          }),
        },
      });

      return result;
    });

    return { 
      message: `Successfully granted ${additionalViews} additional views.`, 
      grantedViews: updated.grantedViews, 
      effectiveMaxViews: session.lecture.maxViews + updated.grantedViews 
    };
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
          where: { deletedAt: null },
          include: {
            course: {
              include: {
                exams: { where: { deletedAt: null } },
                chapters: {
                  where: { deletedAt: null },
                  include: { 
                    exams: { where: { deletedAt: null } }, 
                    lectures: { 
                      where: { deletedAt: null },
                      include: { 
                        sessions: { where: { deletedAt: null } }, 
                        quizzes: { where: { deletedAt: null } }, 
                        exams: { where: { deletedAt: null } } 
                      } 
                    } 
                  }
                },
                lectures: { 
                  where: { deletedAt: null },
                  include: { 
                    sessions: { where: { deletedAt: null } }, 
                    quizzes: { where: { deletedAt: null } }, 
                    exams: { where: { deletedAt: null } } 
                  } 
                }
              }
            }
          }
        },
        accessedLectures: {
          where: { deletedAt: null },
          include: {
            lecture: {
              include: { 
                sessions: { where: { deletedAt: null } }, 
                quizzes: { where: { deletedAt: null } }, 
                exams: { where: { deletedAt: null } }, 
                course: true 
              }
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

  async getLectureViewers(lectureId: string) {
    const accesses = await this.prisma.studentLectureAccess.findMany({
      where: {
        lectureId,
        isStarted: true,
        student: { deletedAt: null }
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            parentPhoneNumber: true,
          }
        }
      },
      orderBy: { activatedAt: 'desc' },
    });

    return accesses.map(a => ({
      studentId: a.student.id,
      fullName: a.student.fullName,
      email: a.student.email,
      phoneNumber: a.student.phoneNumber,
      parentPhoneNumber: a.student.parentPhoneNumber,
      activatedAt: a.activatedAt,
    }));
  }

  /**
   * Returns a merged view of:
   *  1. device-issues.log — every login attempt (with mismatch flag)
   *  2. DeviceHistory DB table — REGISTERED / RESET / REMOVED events
   *
   * Supports:
   *  - search (email or student name)
   *  - mismatchOnly filter (only show failed device checks)
   *  - pagination (skip / take)
   */
  async getDeviceLogs(opts: {
    search?: string;
    mismatchOnly?: boolean;
    skip?: number;
    take?: number;
    all?: boolean;
  }) {
    const { search = '', mismatchOnly = false, skip = 0, take = 50, all = false } = opts;

    // --- 1. Parse device-issues.log ---
    const logPath = path.join(process.cwd(), 'device-issues.log');
    let fileEntries: any[] = [];
    if (fs.existsSync(logPath)) {
      const raw = fs.readFileSync(logPath, 'utf8');
      fileEntries = raw
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            const parsed = JSON.parse(line);
            return {
              source: 'LOGIN_ATTEMPT',
              id: `log_${parsed.timestamp}_${parsed.studentId}`,
              timestamp: parsed.timestamp,
              studentId: parsed.studentId,
              studentEmail: parsed.studentEmail,
              studentName: null, // enriched later
              deviceFingerprint: parsed.receivedFinalId,
              expectedDevice: parsed.expectedDeviceId,
              rawHeaderDeviceId: parsed.rawHeaderDeviceId ?? null,
              rawDtoDeviceId: parsed.rawDtoDeviceId ?? null,
              action: parsed.isMatch ? 'LOGIN_OK' : 'LOGIN_MISMATCH',
              isMatch: parsed.isMatch,
              ipAddress: parsed.ipAddress,
              browser: parsed.browserAgent,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }

    // --- 2. Enrich file entries with student names from DB ---
    const studentIds = [...new Set(fileEntries.map((e) => e.studentId).filter(Boolean))];
    let studentMap: Record<string, { fullName: string; email: string }> = {};
    if (studentIds.length > 0) {
      const students = await this.prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, fullName: true, email: true },
      });
      studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
      fileEntries = fileEntries.map((e) => ({
        ...e,
        studentName: studentMap[e.studentId]?.fullName ?? null,
      }));
    }

    // --- 3. Fetch DeviceHistory DB events ---
    const dbEvents = await this.prisma.deviceHistory.findMany({
      orderBy: { createdAt: 'desc' },
      ...(all ? {} : { take: 1000 }),
      include: { student: { select: { fullName: true, email: true } } },
    });

    const dbEntries = dbEvents.map((e) => ({
      source: 'DEVICE_HISTORY',
      id: `db_${e.id}`,
      timestamp: e.createdAt.toISOString(),
      studentId: e.studentId,
      studentEmail: e.student.email,
      studentName: e.student.fullName,
      deviceFingerprint: e.deviceFingerprint,
      expectedDevice: null,
      rawHeaderDeviceId: null,
      rawDtoDeviceId: null,
      action: e.action, // REGISTERED | RESET | REMOVED | REPLACED
      isMatch: true, // DB events are authoritative (not mismatches)
      ipAddress: e.ipAddress ?? null,
      browser: e.browser ?? null,
    }));

    // --- 4. Merge and sort ---
    let merged = [...fileEntries, ...dbEntries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Calculate overall stats before user search/mismatch filters
    const stats = {
      totalEvents: merged.length,
      matchedLogins: merged.filter((e) => e.isMatch && e.source === 'LOGIN_ATTEMPT').length,
      mismatchLogins: merged.filter((e) => !e.isMatch && e.source === 'LOGIN_ATTEMPT').length,
      dbHistoryEvents: merged.filter((e) => e.source === 'DEVICE_HISTORY').length,
    };

    // --- 5. Apply filters ---
    if (mismatchOnly) {
      merged = merged.filter((e) => !e.isMatch);
    }
    if (search) {
      const q = search.toLowerCase();
      merged = merged.filter(
        (e) =>
          e.studentEmail?.toLowerCase().includes(q) ||
          e.studentName?.toLowerCase().includes(q) ||
          e.studentId?.toLowerCase().includes(q) ||
          e.deviceFingerprint?.toLowerCase().includes(q) ||
          e.expectedDevice?.toLowerCase().includes(q) ||
          e.ipAddress?.toLowerCase().includes(q) ||
          e.browser?.toLowerCase().includes(q),
      );
    }

    const total = merged.length;
    const items = all ? merged : merged.slice(skip, skip + take);

    return { total, items, stats };
  }
}


