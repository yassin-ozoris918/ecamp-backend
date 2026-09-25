import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChapterDto, UpdateChapterDto } from './dto/create-chapter.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ChaptersService {
  constructor(private prisma: PrismaService) {}

  private async verifyCourseOwnership(courseId: string, instructorId: string, role: Role) {
    if (role === Role.ADMIN) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });

    if (!mapping) {
      throw new ForbiddenException('You are not authorized to modify this course.');
    }
  }

  private async verifyChapterOwnership(chapterId: string, instructorId: string, role: Role) {
    if (role === Role.ADMIN) return;

    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { courseId: true },
    });

    if (!chapter) throw new NotFoundException('Chapter not found');

    await this.verifyCourseOwnership(chapter.courseId, instructorId, role);
  }

  async create(dto: CreateChapterDto, instructorId: string, role: Role) {
    await this.verifyCourseOwnership(dto.courseId, instructorId, role);
    return this.prisma.chapter.create({
      data: {
        title: dto.title,
        description: dto.description,
        courseId: dto.courseId,
        orderIndex: dto.orderIndex || 0,
        sortOrder: dto.orderIndex || 0, // Fallback for zero regression
      },
    });
  }

  async findAllByCourse(courseId: string) {
    return this.prisma.chapter.findMany({
      where: { courseId, },
      orderBy: { orderIndex: 'asc' },
      include: {
        lectures: {
          where: { },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async update(id: string, dto: UpdateChapterDto, instructorId: string, role: Role) {
    await this.verifyChapterOwnership(id, instructorId, role);
    
    return this.prisma.chapter.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        orderIndex: dto.orderIndex,
        sortOrder: dto.orderIndex,
      },
    });
  }

  async remove(id: string, instructorId: string, role: Role) {
    await this.verifyChapterOwnership(id, instructorId, role);
    return this.prisma.chapter.delete({ where: { id } });
  }
}

