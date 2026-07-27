import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class StudentRiskAnalyzer {
  private readonly logger = new Logger(StudentRiskAnalyzer.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('attempt.evaluated')
  async handleAttemptEvaluated(payload: {
    studentId: string;
    type: 'QUIZ' | 'EXAM';
    id: string;
    score: number;
    isPassed: boolean;
  }) {
    this.logger.log(`Evaluating risk for student ${payload.studentId} after ${payload.type} attempt.`);

    // 1. Get or create risk profile
    let profile = await this.prisma.studentRiskProfile.findUnique({
      where: { studentId: payload.studentId },
    });

    if (!profile) {
      profile = await this.prisma.studentRiskProfile.create({
        data: {
          studentId: payload.studentId,
          consecutiveFailures: 0,
          runningAverageScore: 100,
          isAtRisk: false,
        },
      });
    }

    // 2. Recalculate metrics
    // Fetch all recent passed/failed attempts for this student
    const exams = await this.prisma.examAttempt.findMany({
      where: { studentId: payload.studentId, status: { in: ['PASSED', 'FAILED'] } },
      select: { score: true, status: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    });

    const quizzes = await this.prisma.quizAttempt.findMany({
      where: { studentId: payload.studentId, status: { in: ['PASSED', 'FAILED'] } },
      select: { score: true, status: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    });

    const allAttempts = [...exams, ...quizzes]
      .filter((a) => a.submittedAt !== null && a.score !== null)
      .sort((a, b) => (b.submittedAt as Date).getTime() - (a.submittedAt as Date).getTime())
      .slice(0, 10);

    let consecutiveFailures = 0;
    for (const att of allAttempts) {
      if (att.status === 'FAILED') {
        consecutiveFailures++;
      } else {
        break; // Stop counting at the first pass
      }
    }

    const totalScores = allAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const runningAverageScore = allAttempts.length > 0 ? totalScores / allAttempts.length : 100;

    const isAtRisk = consecutiveFailures >= 2 || runningAverageScore < 50;
    const justBecameAtRisk = !profile.isAtRisk && isAtRisk;

    // 3. Update profile
    const updatedProfile = await this.prisma.studentRiskProfile.update({
      where: { id: profile.id },
      data: {
        consecutiveFailures,
        runningAverageScore,
        isAtRisk,
      },
    });

    this.logger.log(`Student ${payload.studentId} Risk Metrics -> Avg: ${runningAverageScore.toFixed(2)}, Failures: ${consecutiveFailures}, AtRisk: ${isAtRisk}`);

    // 4. Trigger alert if they just became at risk, or if they failed again while at risk
    if (isAtRisk && (!profile.isAtRisk || !payload.isPassed)) {
       this.eventEmitter.emit('risk.alert', {
         studentId: payload.studentId,
         eventCategory: payload.type === 'EXAM' ? 'EXAM_FAILED' : 'QUIZ_FAILED',
         metrics: { consecutiveFailures, runningAverageScore }
       });
    }
  }
}
