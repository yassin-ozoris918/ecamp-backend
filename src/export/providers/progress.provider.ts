import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class ProgressProvider implements DataProvider {
  entity = 'progress';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = { isCompleted: true };

    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.courseId) {
      where.session = { lecture: { courseId: filters.courseId } };
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.completedAt = {};
      if (filters?.dateFrom) where.completedAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.completedAt.lte = new Date(filters.dateTo);
    }

    const rows = await this.prisma.sessionProgress.findMany({
      where,
      include: {
        session: { select: { title: true, lecture: { select: { title: true, course: { select: { title: true } } } } } },
        student: { select: { fullName: true, email: true } },
      },
      orderBy: { completedAt: 'desc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'studentName', label: 'Student' },
        { key: 'studentEmail', label: 'Email' },
        { key: 'courseTitle', label: 'Course' },
        { key: 'lectureTitle', label: 'Lecture' },
        { key: 'sessionTitle', label: 'Session' },
        { key: 'completedAt', label: 'Completed At' },
      ],
      data: rows.map((r) => ({
        id: r.id,
        studentName: r.student?.fullName || '',
        studentEmail: r.student?.email || '',
        courseTitle: r.session?.lecture?.course?.title || '',
        lectureTitle: r.session?.lecture?.title || '',
        sessionTitle: r.session?.title || '',
        completedAt: r.completedAt?.toISOString() || '',
      })),
    };
  }
}
