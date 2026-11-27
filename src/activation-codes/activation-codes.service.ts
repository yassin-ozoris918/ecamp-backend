import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { GenerateCodesDto } from './dto/generate-codes.dto';
import { RedeemCodeDto } from './dto/redeem-code.dto';
import * as crypto from 'crypto';
import { CodeStatus, ActivationCodeType, EducationLevel, LectureAccessSource } from '@prisma/client';
import { effectiveLectureAccess } from '../common/lecture-lock.policy';
import { codeError } from './code-errors';
import type { RedeemFilesDto } from './dto/redeem-files.dto';

@Injectable()
export class ActivationCodesService {
  constructor(
    private prisma: PrismaService,
    private coursesService: CoursesService,
  ) {}

  async getAllCodes(skip: number = 0, take: number = 50, search?: string, status?: string, targetType?: string, educationLevel?: string) {
    const whereClause: any = { };
    if (search) {
      whereClause.code = { contains: search, mode: 'insensitive' };
    }
    if (status && status !== 'All') {
      if (status === 'AVAILABLE') {
        whereClause.status = 'UNUSED';
      } else if (status === 'REDEEMED') {
        whereClause.status = 'REDEEMED';
      }
    }
    if (targetType && targetType !== 'All') {
      whereClause.targetType = targetType;
    }
    if (educationLevel && educationLevel !== 'All') {
      whereClause.educationLevel = educationLevel;
    }

    const [items, total] = await Promise.all([
      this.prisma.activationCode.findMany({
        where: whereClause,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: {
          redeemedLecture: {
            select: { title: true, course: { select: { title: true } } },
          },
          redeemedCourse: { select: { title: true } },
          redeemedAttachment: { select: { title: true, lecture: { select: { course: { select: { title: true } } } } } },
          student: { select: { fullName: true } },
        },
      }),
      this.prisma.activationCode.count({ where: whereClause }),
    ]);

    return {
      items: items.map((c) => ({
        ...c,
        courseTitle: c.targetType === 'COURSE' || c.targetType === 'COURSE_FILES' ? c.redeemedCourse?.title : (c.targetType === 'FILE' ? c.redeemedAttachment?.lecture?.course?.title : c.redeemedLecture?.course?.title),
        lectureTitle: c.redeemedLecture?.title,
        attachmentTitle: c.redeemedAttachment?.title,
        redeemerName: c.student?.fullName,
      })),
      total,
      skip,
      take,
    };
  }

  // --- Admin Code Generation ---
  async generateCodes(dto: GenerateCodesDto, actorId?: string) {
    // 1. Prepare the batch of codes
    const codesToCreate: { targetType: ActivationCodeType, educationLevel: EducationLevel, code: string }[] = [];
    for (let i = 0; i < dto.count; i++) {
      codesToCreate.push({
        targetType: dto.targetType,
        educationLevel: dto.educationLevel,
        code: this.generateSecureCode(),
      });
    }

    // 2. Save and record history atomically
    const createdCodes = await this.prisma.$transaction(async (tx) => {
      await tx.activationCode.createMany({
        data: codesToCreate,
        skipDuplicates: true,
      });

      const codes = await tx.activationCode.findMany({
        where: { code: { in: codesToCreate.map((c) => c.code) } },
      });

      await tx.activationCodeHistory.createMany({
        data: codes.map((c) => ({
          codeId: c.id,
          code: c.code,
          action: 'GENERATED',
          oldStatus: null,
          newStatus: CodeStatus.UNUSED,
          actorId: actorId ?? null,
        })),
      });

      return codes;
    });

    return {
      message: `Successfully generated ${createdCodes.length} ${dto.educationLevel} ${dto.targetType} activation codes.`,
      codes: createdCodes.map((c) => c.code),
    };
  }

  // --- Admin Code Deactivation ---
  async deactivateCode(id: string, actorId?: string) {
    const code = await this.prisma.activationCode.findUnique({
      where: { id, },
    });

    if (!code) throw new NotFoundException('Code not found.');
    if (code.status === CodeStatus.REDEEMED) {
      throw new BadRequestException('Cannot deactivate an already redeemed code.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.activationCode.delete({ where: { id } });
      return { message: 'Code deactivated successfully.' };
    });
  }

  // --- Admin Code Deletion ---
  async deleteCode(id: string) {
    const code = await this.prisma.activationCode.findUnique({ where: { id } });
    if (!code) throw new NotFoundException('Code not found.');
    
    await this.prisma.activationCode.delete({ where: { id } });
    return { message: 'Code deleted successfully.' };
  }

  async deleteAllCodes() {
    const result = await this.prisma.activationCode.deleteMany();
    return { message: `Successfully deleted ${result.count} codes.` };
  }

  async markCopied(id: string) {
    const code = await this.prisma.activationCode.findUnique({ where: { id } });
    if (!code) throw new NotFoundException('Code not found.');

    await this.prisma.activationCode.update({
      where: { id },
      data: { isCopied: true },
    });

    return { message: 'Code marked as copied.' };
  }


  async getHistory(codeId: string) {
    const code = await this.prisma.activationCode.findUnique({
      where: { id: codeId },
      select: { id: true },
    });
    if (!code) throw new NotFoundException('Activation code not found.');

    return this.prisma.activationCodeHistory.findMany({
      where: { codeId },
      orderBy: { createdAt: 'asc' },
      include: {
        actor: { select: { fullName: true, email: true } },
        student: { select: { fullName: true, email: true } },
      },
    });
  }

  // --- Student Code Redemption ---
  async redeemCode(
    dto: RedeemCodeDto,
    studentId: string,
    ipAddress?: string,
    browser?: string,
  ) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found.');

    return this.prisma.$transaction(async (tx) => {
      // Accept the code however the student typed it (case, spaces, missing dashes, O for 0).
      const activationCode = await tx.activationCode.findFirst({
        where: { code: { in: codeCandidates(dto.code) } },
        include: CODE_TARGET_TITLES,
      });

      assertCodeUsable(activationCode, studentId, student.educationLevel);

      if (activationCode.targetType !== dto.targetType) {
        codeError('forbidden', 'CODE_WRONG_TYPE', `This code is valid for a ${activationCode.targetType}, but you are trying to unlock a ${dto.targetType}.`, {
          codeType: activationCode.targetType,
          expectedType: dto.targetType,
        });
      }

      const now = new Date();
      let expiresAt: Date | null = null;
      let responseTitle = '';

      if (dto.targetType === 'LECTURE') {
        const lecture = await tx.lecture.findUnique({ where: { id: dto.targetId } });
        if (!lecture) codeError('notFound', 'TARGET_NOT_FOUND', 'Lecture not found.');
        
        const existingAccess = await tx.studentLectureAccess.findFirst({
          where: { studentId, lectureId: dto.targetId, },
        });

        if (existingAccess && effectiveLectureAccess(lecture, existingAccess)) {
          codeError('forbidden', 'ALREADY_HAVE_ACCESS', 'You already have access to this lecture. Keep this code safe!', { what: 'LECTURE', title: lecture.title });
        }

        if (existingAccess) {
          // Locked lecture the student had only opened through the full course / free course:
          // the code turns it into a fresh, separately-owned lecture (new timer).
          await tx.studentLectureAccess.update({
            where: { id: existingAccess.id },
            data: {
              source: LectureAccessSource.CODE,
              isStarted: false,
              activatedAt: null,
              expiresAt: null,
              timerPausedAt: null,
              deletedAt: null,
            },
          });
        } else {
          await tx.studentLectureAccess.create({
            data: {
              studentId,
              lectureId: dto.targetId,
              isStarted: false,
              source: LectureAccessSource.CODE,
            },
          });
        }
        responseTitle = lecture.title;

        // Update code
        await tx.activationCode.update({
          where: { id: activationCode.id },
          data: {
            status: CodeStatus.REDEEMED,
            redeemedAt: now,
            studentId,
            redeemedLectureId: dto.targetId,
          },
        });

      } else if (dto.targetType === 'COURSE') {
        // COURSE REDEMPTION
        const course = await tx.course.findUnique({ where: { id: dto.targetId } });
        if (!course) codeError('notFound', 'TARGET_NOT_FOUND', 'Course not found.');

        if (course.type === 'MATERIALS_ONLY') {
          codeError('forbidden', 'COURSE_CODE_MATERIALS_ONLY', 'Materials-only courses cannot be enrolled using a course code.', { courseTitle: course.title });
        }

        const existingAccess = await tx.studentCourseAccess.findFirst({
          where: { studentId, courseId: dto.targetId, },
        });

        if (existingAccess) {
          codeError('forbidden', 'ALREADY_HAVE_ACCESS', 'You already have access to this course. Keep this code safe!', { what: 'COURSE', title: course.title });
        }

        if (course.validityDays && course.validityDays > 0) {
          expiresAt = new Date(now.getTime() + course.validityDays * 24 * 60 * 60 * 1000);
        }

        await tx.studentCourseAccess.create({
          data: {
            studentId,
            courseId: dto.targetId,
            activatedAt: now,
            expiresAt,
          },
        });
        responseTitle = course.title;

        // Update code
        await tx.activationCode.update({
          where: { id: activationCode.id },
          data: {
            status: CodeStatus.REDEEMED,
            redeemedAt: now,
            studentId,
            redeemedCourseId: dto.targetId,
          },
        });
      } else if (dto.targetType === 'FILE' || dto.targetType === 'COURSE_FILES') {
        const eligibleCourses = await this.coursesService.getCoursesForStudent(studentId, true);
        const eligibleCourseIds = eligibleCourses.map(c => c.id);

        let attachment: any = null;
        let targetCourseId: string | null = null;

        if (dto.targetType === 'FILE') {
          attachment = await tx.attachment.findUnique({
            where: { id: dto.targetId },
            include: { lecture: true }
          });
          if (!attachment || attachment.deletedAt) codeError('notFound', 'TARGET_NOT_FOUND', 'File not found.');
          targetCourseId = attachment.lecture.courseId;
        } else {
          const course = await tx.course.findUnique({ where: { id: dto.targetId } });
          if (!course) codeError('notFound', 'TARGET_NOT_FOUND', 'Course not found.');
          targetCourseId = dto.targetId;
        }

        if (!targetCourseId || !eligibleCourseIds.includes(targetCourseId)) {
          codeError('forbidden', 'NOT_ELIGIBLE', 'You are not eligible to access files for this course based on your academic profile.');
        }

        // The whole course is already open: a course-files code would add nothing.
        if (dto.targetType === 'COURSE_FILES') {
          const full = await tx.studentCourseAccess.findFirst({ where: { studentId, courseId: targetCourseId } });
          if (full) {
            codeError('forbidden', 'ALREADY_HAVE_ACCESS', 'You already have the whole course, including its files. Keep this code safe!', {
              what: 'COURSE',
              title: eligibleCourses.find((c) => c.id === targetCourseId)?.title,
            });
          }
        }

        const existingAccess = await tx.studentFileAccess.findFirst({
          where: {
            studentId,
            ...(dto.targetType === 'FILE' ? { attachmentId: dto.targetId } : { courseId: dto.targetId }),
          }
        });

        if (existingAccess) {
          codeError('forbidden', 'ALREADY_HAVE_ACCESS', `You already have access to ${dto.targetType === 'FILE' ? 'this file' : 'these course files'}. Keep this code safe!`, {
            what: dto.targetType,
            title: dto.targetType === 'FILE' ? attachment!.title : eligibleCourses.find((c) => c.id === targetCourseId)?.title,
          });
        }

        await tx.studentFileAccess.create({
          data: {
            studentId,
            ...(dto.targetType === 'FILE' ? { attachmentId: dto.targetId } : { courseId: dto.targetId }),
            source: dto.targetType === 'FILE' ? 'FILE_CODE' : 'COURSE_FILES_CODE',
          }
        });

        responseTitle = dto.targetType === 'FILE' ? attachment!.title : eligibleCourses.find(c => c.id === targetCourseId)!.title;

        await tx.activationCode.update({
          where: { id: activationCode.id },
          data: {
            status: CodeStatus.REDEEMED,
            redeemedAt: now,
            studentId,
            ...(dto.targetType === 'FILE' ? { redeemedAttachmentId: dto.targetId } : { redeemedCourseId: dto.targetId }),
          },
        });
      }

      await tx.activationCodeHistory.create({
        data: {
          codeId: activationCode.id,
          code: activationCode.code,
          redeemedLectureId: dto.targetType === 'LECTURE' ? dto.targetId : null,
          redeemedCourseId: dto.targetType === 'COURSE' || dto.targetType === 'COURSE_FILES' ? dto.targetId : null,
          redeemedAttachmentId: dto.targetType === 'FILE' ? dto.targetId : null,
          action: 'REDEEMED',
          oldStatus: CodeStatus.UNUSED,
          newStatus: CodeStatus.REDEEMED,
          studentId,
          actorId: studentId,
          ipAddress: ipAddress ?? null,
          browser: browser ?? null,
        },
      });

      return {
        message: 'Code redeemed successfully!',
        title: responseTitle,
        type: dto.targetType,
        targetId: dto.targetId,
      };
    });
  }

  /**
   * Files page: one code box that works out what kind of code it got.
   *
   *  - single-file code typed on a file → opens that file; typed for a course → asks which file (409 FILE_CODE_PICK_FILE)
   *  - course-files code typed for a course → opens the course's files; typed on one file → asks first (409 CONFIRM_COURSE_FILES)
   *  - lecture code typed on a file → offers to unlock that file's lecture (409 CONFIRM_LECTURE)
   *  - full-course code → offers to unlock the whole course (409 CONFIRM_COURSE)
   *
   * Nothing is redeemed until the student confirms (`confirm: true`), so a code is never spent on
   * something they didn't mean.
   */
  async redeemForFiles(dto: RedeemFilesDto, studentId: string, ipAddress?: string, browser?: string) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { educationLevel: true } });
    if (!student) throw new NotFoundException('Student not found.');

    const activationCode = await this.prisma.activationCode.findFirst({
      where: { code: { in: codeCandidates(dto.code) } },
      include: CODE_TARGET_TITLES,
    });
    assertCodeUsable(activationCode, studentId, student.educationLevel);

    let attachment: { id: string; title: string; lecture: { id: string; title: string; courseId: string; requiresOwnCode: boolean } } | null = null;
    let courseId = dto.courseId ?? null;
    if (dto.attachmentId) {
      attachment = await this.prisma.attachment.findFirst({
        where: { id: dto.attachmentId, deletedAt: null },
        select: { id: true, title: true, lecture: { select: { id: true, title: true, courseId: true, requiresOwnCode: true } } },
      });
      if (!attachment?.lecture) codeError('notFound', 'TARGET_NOT_FOUND', 'File not found.');
      courseId = attachment.lecture.courseId;
    }
    if (!courseId) codeError('badRequest', 'PICK_COURSE', 'Choose the course you want to unlock files for.');

    const course = await this.prisma.course.findFirst({ where: { id: courseId }, select: { id: true, title: true, type: true } });
    if (!course) codeError('notFound', 'TARGET_NOT_FOUND', 'Course not found.');
    const eligible = await this.coursesService.getCoursesForStudent(studentId, true);
    if (!eligible.some((c) => c.id === course.id)) {
      codeError('forbidden', 'NOT_ELIGIBLE', 'This course is not part of your study plan.', { courseTitle: course.title });
    }

    const redeem = (targetType: ActivationCodeType, targetId: string) =>
      this.redeemCode({ code: activationCode.code, targetType, targetId }, studentId, ipAddress, browser);

    switch (activationCode.targetType) {
      case ActivationCodeType.FILE:
        if (!attachment) {
          codeError('conflict', 'FILE_CODE_PICK_FILE', 'This code opens one file. Choose which file to unlock.', { courseId: course.id, courseTitle: course.title });
        }
        return redeem(ActivationCodeType.FILE, attachment.id);

      case ActivationCodeType.COURSE_FILES: {
        if (attachment && !dto.confirm) {
          const [opens, staysLocked, already] = await Promise.all([
            this.prisma.attachment.count({ where: { deletedAt: null, lecture: { courseId: course.id, requiresOwnCode: false } } }),
            this.prisma.attachment.count({ where: { deletedAt: null, lecture: { courseId: course.id, requiresOwnCode: true } } }),
            this.prisma.studentFileAccess.findFirst({ where: { studentId, courseId: course.id }, select: { id: true } }),
          ]);
          if (already) {
            codeError('forbidden', 'ALREADY_HAVE_ACCESS', 'You already have these course files. Keep this code safe!', { what: 'COURSE_FILES', title: course.title });
          }
          codeError('conflict', 'CONFIRM_COURSE_FILES', `This code opens all the files of ${course.title}.`, {
            courseId: course.id,
            courseTitle: course.title,
            opens,
            staysLocked,
            thisFileStaysLocked: attachment.lecture.requiresOwnCode,
          });
        }
        return redeem(ActivationCodeType.COURSE_FILES, course.id);
      }

      case ActivationCodeType.LECTURE:
        if (!attachment) {
          codeError('badRequest', 'LECTURE_CODE_USE_LECTURE_PAGE', 'This is a lecture code. Enter it on the page of the lecture you bought.', { courseTitle: course.title });
        }
        if (!dto.confirm) {
          codeError('conflict', 'CONFIRM_LECTURE', `This is a lecture code. Unlock the lecture "${attachment.lecture.title}"?`, {
            lectureId: attachment.lecture.id,
            lectureTitle: attachment.lecture.title,
          });
        }
        return redeem(ActivationCodeType.LECTURE, attachment.lecture.id);

      case ActivationCodeType.COURSE:
        if (course.type === 'MATERIALS_ONLY') {
          codeError('forbidden', 'COURSE_CODE_MATERIALS_ONLY', 'This is a full-course code, and this course only sells files.', { courseTitle: course.title });
        }
        if (!dto.confirm) {
          codeError('conflict', 'CONFIRM_COURSE', `This is a full-course code. Unlock the whole course ${course.title}?`, { courseId: course.id, courseTitle: course.title });
        }
        return redeem(ActivationCodeType.COURSE, course.id);
    }
    codeError('badRequest', 'CODE_WRONG_TYPE', 'This code cannot be used here.');
  }

  // --- Helper Function ---
  // Generates a 12-character hexadecimal code formatted as XXXX-XXXX-XXXX
  private generateSecureCode(): string {
    const block1 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const block2 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const block3 = crypto.randomBytes(4).toString('hex').toUpperCase();

    return `${block1}-${block2}-${block3}`;
  }
}

/**
 * Ways a typed code may match a stored one. Generated codes are three blocks of 8 hex characters
 * (0-9, A-F) joined by dashes, so letters that are not hex but look like digits (O, I, L) can safely be
 * read as 0 and 1. The exact input is tried too, so older or hand-made codes keep working.
 */
export function codeCandidates(input: string): string[] {
  const raw = String(input ?? '').trim();
  const upper = raw.toUpperCase().replace(/\s+/g, '');
  const candidates = new Set<string>([raw, upper]);
  const hex = upper.replace(/[OQ]/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-F]/g, '');
  if (hex.length === 24) candidates.add(`${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16)}`);
  return [...candidates].filter(Boolean);
}

const CODE_TARGET_TITLES = {
  redeemedLecture: { select: { title: true } },
  redeemedCourse: { select: { title: true } },
  redeemedAttachment: { select: { title: true } },
} as const;

type CodeWithTitles = {
  id: string;
  code: string;
  status: CodeStatus;
  targetType: ActivationCodeType;
  educationLevel: EducationLevel;
  studentId: string | null;
  redeemedAt: Date | null;
  redeemedLecture: { title: string } | null;
  redeemedCourse: { title: string } | null;
  redeemedAttachment: { title: string } | null;
};

/** Not found / already used (by you or someone else) / meant for another education level. */
function assertCodeUsable<T extends CodeWithTitles>(code: T | null, studentId: string, level: EducationLevel): asserts code is T {
  if (!code) {
    codeError('notFound', 'CODE_NOT_FOUND', 'Invalid activation code.');
  }
  if (code.status === CodeStatus.REDEEMED) {
    if (code.studentId === studentId) {
      codeError('forbidden', 'CODE_ALREADY_USED_BY_YOU', 'You already used this code.', {
        usedOn: code.redeemedAttachment?.title ?? code.redeemedLecture?.title ?? code.redeemedCourse?.title ?? null,
        usedType: code.targetType,
        usedAt: code.redeemedAt,
      });
    }
    codeError('forbidden', 'CODE_ALREADY_USED', 'This code has already been redeemed.');
  }
  if (code.educationLevel !== level) {
    codeError('forbidden', 'CODE_WRONG_LEVEL', `This code is for ${code.educationLevel} students, but your account is marked as ${level}.`, {
      codeLevel: code.educationLevel,
      yourLevel: level,
    });
  }
}
