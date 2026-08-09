import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateCodesDto } from './dto/generate-codes.dto';
import { RedeemCodeDto } from './dto/redeem-code.dto';
import * as crypto from 'crypto';
import { CodeStatus, ActivationCodeType, EducationLevel } from '@prisma/client';

@Injectable()
export class ActivationCodesService {
  constructor(private prisma: PrismaService) {}

  async getAllCodes(skip: number = 0, take: number = 50, search?: string, status?: string, targetType?: string, educationLevel?: string) {
    const whereClause: any = { };
    if (search) {
      whereClause.code = { contains: search, mode: 'insensitive' };
    }
    if (status && status !== 'All') {
      whereClause.status = status;
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
          student: { select: { fullName: true } },
        },
      }),
      this.prisma.activationCode.count({ where: whereClause }),
    ]);

    return {
      items: items.map((c) => ({
        ...c,
        courseTitle: c.targetType === 'COURSE' ? c.redeemedCourse?.title : c.redeemedLecture?.course?.title,
        lectureTitle: c.redeemedLecture?.title,
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
      await tx.activationCode.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await tx.activationCodeHistory.create({
        data: {
          codeId: id,
          code: code.code,
          action: 'REVOKED',
          oldStatus: CodeStatus.UNUSED,
          newStatus: CodeStatus.UNUSED,
          actorId: actorId ?? null,
        },
      });

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
      const activationCode = await tx.activationCode.findFirst({
        where: { code: dto.code, },
      });

      if (!activationCode) {
        throw new NotFoundException('Invalid activation code.');
      }

      if (activationCode.status === CodeStatus.REDEEMED) {
        throw new ForbiddenException('This code has already been redeemed.');
      }

      if (activationCode.targetType !== dto.targetType) {
        throw new ForbiddenException(`This code is valid for a ${activationCode.targetType}, but you are trying to unlock a ${dto.targetType}.`);
      }

      if (activationCode.educationLevel !== student.educationLevel) {
        throw new ForbiddenException(`This code is for ${activationCode.educationLevel} students, but your account is marked as ${student.educationLevel}.`);
      }

      const now = new Date();
      let expiresAt: Date | null = null;
      let responseTitle = '';

      if (dto.targetType === 'LECTURE') {
        const lecture = await tx.lecture.findUnique({ where: { id: dto.targetId } });
        if (!lecture) throw new NotFoundException('Lecture not found.');
        
        const existingAccess = await tx.studentLectureAccess.findFirst({
          where: { studentId, lectureId: dto.targetId, },
        });

        if (existingAccess) {
          throw new ForbiddenException('You already have access to this lecture. Keep this code safe!');
        }

        await tx.studentLectureAccess.create({
          data: {
            studentId,
            lectureId: dto.targetId,
            isStarted: false,
          },
        });
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

      } else {
        // COURSE REDEMPTION
        const course = await tx.course.findUnique({ where: { id: dto.targetId } });
        if (!course) throw new NotFoundException('Course not found.');

        const existingAccess = await tx.studentCourseAccess.findFirst({
          where: { studentId, courseId: dto.targetId, },
        });

        if (existingAccess) {
          throw new ForbiddenException('You already have access to this course. Keep this code safe!');
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
      }

      await tx.activationCodeHistory.create({
        data: {
          codeId: activationCode.id,
          code: activationCode.code,
          redeemedLectureId: dto.targetType === 'LECTURE' ? dto.targetId : null,
          redeemedCourseId: dto.targetType === 'COURSE' ? dto.targetId : null,
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

  // --- Helper Function ---
  // Generates a 12-character hexadecimal code formatted as XXXX-XXXX-XXXX
  private generateSecureCode(): string {
    const block1 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const block2 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const block3 = crypto.randomBytes(4).toString('hex').toUpperCase();

    return `${block1}-${block2}-${block3}`;
  }
}

