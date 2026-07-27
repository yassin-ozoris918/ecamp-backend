import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class LecturesProvider implements DataProvider {
  entity = 'lectures';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = { };

    if (filters?.courseId) where.courseId = filters.courseId;
    

    const lectures = await this.prisma.lecture.findMany({
      where,
      include: { course: { select: { title: true } }, chapter: { select: { title: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Title' },
        { key: 'courseTitle', label: 'Course' },
        { key: 'chapterTitle', label: 'Chapter' },
        
        { key: 'validityDays', label: 'Validity Days' },
        { key: 'sortOrder', label: 'Sort Order' },
        { key: 'createdAt', label: 'Created At' },
      ],
      data: lectures.map((l) => ({
        id: l.id,
        title: l.title,
        courseTitle: l.course?.title || '',
        chapterTitle: l.chapter?.title || '',
        
        validityDays: l.validityDays ?? '',
        sortOrder: l.sortOrder,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }
}

