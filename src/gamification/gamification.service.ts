import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent('user.login')
  async handleUserLogin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const now = new Date();
    const lastLogin = user.lastLoginAt;

    let newStreak = user.streakDays;
    let earnedXp = 0;

    if (!lastLogin) {
      newStreak = 1;
      earnedXp = 10;
    } else {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysSinceLastLogin = Math.floor(
        (now.getTime() - lastLogin.getTime()) / msPerDay,
      );

      if (daysSinceLastLogin === 1) {
        newStreak += 1;
        earnedXp = 10;
      } else if (daysSinceLastLogin > 1) {
        newStreak = 1; // Streak reset
        earnedXp = 10;
      }
      // If daysSinceLastLogin === 0, they already logged in today. No streak update, no XP.
    }

    if (earnedXp > 0 || newStreak !== user.streakDays || !lastLogin) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          streakDays: newStreak,
          xp: { increment: earnedXp },
          lastLoginAt: now,
        },
      });
      this.logger.log(
        `User ${userId} logged in. Streak: ${newStreak}, Earned XP: ${earnedXp}`,
      );
    }
  }

  @OnEvent('session.completed')
  async handleSessionCompleted(payload: {
    studentId: string;
    sessionId: string;
  }) {
    await this.prisma.user.update({
      where: { id: payload.studentId },
      data: { xp: { increment: 50 } },
    });
    this.logger.log(
      `User ${payload.studentId} completed a session. Earned 50 XP.`,
    );
  }

  @OnEvent('quiz.passed')
  async handleQuizPassed(payload: {
    studentId: string;
    quizId: string;
    score: number;
  }) {
    const xpReward = payload.score === 100 ? 150 : 100;

    await this.prisma.user.update({
      where: { id: payload.studentId },
      data: { xp: { increment: xpReward } },
    });
    this.logger.log(
      `User ${payload.studentId} passed a quiz. Earned ${xpReward} XP.`,
    );

    // If perfect score, check/award badge
    if (payload.score === 100) {
      await this.awardBadge(
        payload.studentId,
        'Perfect Quizzer',
        'Got 100% on a quiz!',
      );
    }
  }

  @OnEvent('exam.passed')
  async handleExamPassed(payload: {
    studentId: string;
    examId: string;
    score: number;
  }) {
    await this.prisma.user.update({
      where: { id: payload.studentId },
      data: { xp: { increment: 500 } },
    });
    this.logger.log(`User ${payload.studentId} passed an exam. Earned 500 XP.`);
  }

  private async awardBadge(
    studentId: string,
    badgeName: string,
    description: string,
  ) {
    let badge = await this.prisma.badge.findFirst({
      where: { name: badgeName },
    });
    if (!badge) {
      badge = await this.prisma.badge.create({
        data: { name: badgeName, description },
      });
    }

    // Check if user already has this badge
    const existing = await this.prisma.studentBadge.findFirst({
      where: { studentId, badgeId: badge.id, },
    });

    if (!existing) {
      await this.prisma.studentBadge.create({
        data: { studentId, badgeId: badge.id },
      });
      this.logger.log(`Awarded badge "${badgeName}" to student ${studentId}`);
    }
  }

  async getLeaderboard(limit = 50) {
    return this.prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: {
        id: true,
        fullName: true,
        xp: true,
        streakDays: true,
        profilePictureUrl: true,
      },
      orderBy: { xp: 'desc' },
      take: limit,
    });
  }

  async getMyStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        xp: true,
        streakDays: true,
        badges: { include: { badge: true } },
      },
    });

    const rankQuery = await this.prisma.user.count({
      where: { role: 'STUDENT', xp: { gt: user?.xp || 0 } },
    });

    const courseCount = await this.prisma.studentLectureAccess.count({
      where: { studentId: userId, },
    });

    const completedCount = await this.prisma.sessionProgress.count({
      where: { studentId: userId, isCompleted: true },
    });

    return {
      xp: user?.xp || 0,
      streakDays: user?.streakDays || 0,
      rank: rankQuery + 1,
      badges: user?.badges.map((b) => b.badge) || [],
      courseCount,
      completedCount,
    };
  }
}

