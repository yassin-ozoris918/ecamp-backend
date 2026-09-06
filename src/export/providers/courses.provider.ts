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
        { key: 'targetHighSchoolSystem', label: 'Target High School System' },
        { key: 'targetStudyMode', label: 'Target Study Mode' },
        { key: 'targetStudyLanguage', label: 'Target Study Language' },
        { key: 'targetHighSchoolGrade', label: 'Target High School Grade' },
        { key: 'targetTraditionalBranch', label: 'Target Traditional Branch' },
        { key: 'targetBaccalaureatePath', label: 'Target Baccalaureate Path' },
        { key: 'targetUniversity', label: 'Target University' },
        { key: 'targetFaculty', label: 'Target Faculty' },
        { key: 'targetDepartment', label: 'Target Department' },
        { key: 'targetAcademicYear', label: 'Target Academic Year' },
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
        targetHighSchoolSystem: c.targetHighSchoolSystem,
        targetStudyMode: c.targetStudyMode,
        targetStudyLanguage: c.targetStudyLanguage,
        targetHighSchoolGrade: c.targetHighSchoolGrade,
        targetTraditionalBranch: c.targetTraditionalBranch,
        targetBaccalaureatePath: c.targetBaccalaureatePath,
        targetUniversity: c.targetUniversity,
        targetFaculty: c.targetFaculty,
        targetDepartment: c.targetDepartment,
        targetAcademicYear: c.targetAcademicYear,
        lecturesCount: c._count.lectures,
        chaptersCount: c._count.chapters,
        examsCount: c._count.exams,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}

