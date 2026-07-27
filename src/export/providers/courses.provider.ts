import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class CoursesProvider implements DataProvider {
  entity = 'courses';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = { };

    if (filters?.status) where.status = filters.status;
    if (filters?.audienceType) where.audienceType = filters.audienceType;
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const courses = await this.prisma.course.findMany({
      where,
      include: { _count: { select: { lectures: true, chapters: true, exams: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status' },
        { key: 'audienceType', label: 'Audience' },
        { key: 'lecturesCount', label: 'Lectures' },
        { key: 'chaptersCount', label: 'Chapters' },
        { key: 'examsCount', label: 'Exams' },
        { key: 'createdAt', label: 'Created At' },
      ],
      data: courses.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        audienceType: c.audienceType,
        lecturesCount: c._count.lectures,
        chaptersCount: c._count.chapters,
        examsCount: c._count.exams,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}

