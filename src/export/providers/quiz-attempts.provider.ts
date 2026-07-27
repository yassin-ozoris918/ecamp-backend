import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class QuizAttemptsProvider implements DataProvider {
  entity = 'quiz-attempts';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = {};

    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.quizId) where.quizId = filters.quizId;
    if (filters?.status) where.status = filters.status;
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const attempts = await this.prisma.quizAttempt.findMany({
      where,
      include: { student: { select: { fullName: true, email: true } }, quiz: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'studentName', label: 'Student' },
        { key: 'studentEmail', label: 'Email' },
        { key: 'quizTitle', label: 'Quiz' },
        { key: 'score', label: 'Score' },
        { key: 'status', label: 'Status' },
        { key: 'startedAt', label: 'Started At' },
        { key: 'submittedAt', label: 'Submitted At' },
      ],
      data: attempts.map((a) => ({
        id: a.id,
        studentName: a.student?.fullName || '',
        studentEmail: a.student?.email || '',
        quizTitle: a.quiz?.title || '',
        score: a.score,
        status: a.status,
        startedAt: a.startedAt.toISOString(),
        submittedAt: a.submittedAt?.toISOString() || '',
      })),
    };
  }
}
