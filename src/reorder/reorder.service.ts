import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

interface EntityHandler {
  model: string;
  parentModel: string;
  parentField: string;
  orderField: string;
  hasDeletedAt: boolean;
  getCourseId: (prisma: PrismaService, parentId: string) => Promise<string>;
}

const HANDLERS: Record<string, EntityHandler> = {
  'chapter': {
    model: 'chapter',
    parentModel: 'course',
    parentField: 'courseId',
    orderField: 'orderIndex',
    hasDeletedAt: true,
    getCourseId: async (_prisma, parentId) => parentId,
  },
  'lecture': {
    model: 'lecture',
    parentModel: 'course',
    parentField: 'courseId',
    orderField: 'sortOrder',
    hasDeletedAt: true,
    getCourseId: async (_prisma, parentId) => parentId,
  },
  'session': {
    model: 'session',
    parentModel: 'lecture',
    parentField: 'lectureId',
    orderField: 'orderIndex',
    hasDeletedAt: true,
    getCourseId: async (prisma, parentId) => {
      const lecture = await prisma.lecture.findUnique({ where: { id: parentId }, select: { courseId: true } });
      if (!lecture) throw new NotFoundException('Parent lecture not found');
      return lecture.courseId;
    },
  },
  'quiz': {
    model: 'quiz',
    parentModel: 'lecture',
    parentField: 'lectureId',
    orderField: 'orderIndex',
    hasDeletedAt: true,
    getCourseId: async (prisma, parentId) => {
      const lecture = await prisma.lecture.findFirst({ where: { id: parentId, }, select: { courseId: true } });
      if (!lecture) throw new NotFoundException('Parent lecture not found');
      return lecture.courseId;
    },
  },
  'quiz-question': {
    model: 'quizQuestion',
    parentModel: 'quiz',
    parentField: 'quizId',
    orderField: 'orderIndex',
    hasDeletedAt: false,
    getCourseId: async (prisma, parentId) => {
      const quiz = await prisma.quiz.findFirst({
        where: { id: parentId, },
        include: { lecture: { select: { courseId: true } } },
      });
      if (!quiz) throw new NotFoundException('Parent quiz not found');
      return quiz.lecture.courseId;
    },
  },
};

@Injectable()
export class ReorderService {
  constructor(private prisma: PrismaService) {}

  async reorder(
    entityType: string,
    parentId: string,
    items: { id: string; orderIndex: number }[],
    userId: string,
    role: Role,
  ) {
    if (items.length === 0) throw new BadRequestException('Items array must not be empty');

    const ids = items.map((i) => i.id);
    const orderIndices = items.map((i) => i.orderIndex);

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate item IDs are not allowed');
    }
    if (new Set(orderIndices).size !== orderIndices.length) {
      throw new BadRequestException('Duplicate orderIndex values are not allowed');
    }

    const handler = HANDLERS[entityType];
    if (!handler) throw new BadRequestException(`Unsupported entity type: ${entityType}`);

    const courseId = await handler.getCourseId(this.prisma, parentId);
    await this.verifyCourseOwnership(courseId, userId, role);

    return this.prisma.$transaction(async (tx: any) => {
      const parent = await tx[handler.parentModel].findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new NotFoundException('Parent entity not found');

      const itemFilter: any = { id: { in: ids }, [handler.parentField]: parentId };
      if (handler.hasDeletedAt) itemFilter.deletedAt = null;

      const existingItems = await tx[handler.model].findMany({
        where: itemFilter,
        select: { id: true },
      });

      if (existingItems.length !== ids.length) {
        throw new BadRequestException('One or more items do not exist or do not belong to the specified parent');
      }

      for (const item of items) {
        const where: any = { id: item.id };
        if (handler.hasDeletedAt) where.deletedAt = null;

        await tx[handler.model].update({
          where,
          data: { [handler.orderField]: item.orderIndex },
        });
      }

      const returnFilter: any = { [handler.parentField]: parentId };
      if (handler.hasDeletedAt) returnFilter.deletedAt = null;

      return tx[handler.model].findMany({
        where: returnFilter,
        orderBy: { [handler.orderField]: 'asc' },
      });
    });
  }

  private async verifyCourseOwnership(courseId: string, userId: string, role: Role): Promise<void> {
    if (role === Role.ADMIN) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId: userId, },
    });
    if (!mapping) throw new ForbiddenException('You do not have permission to reorder items in this course');
  }
}

