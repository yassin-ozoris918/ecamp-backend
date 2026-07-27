import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateChapterAttachmentDto } from './dto/create-chapter-attachment.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ChapterAttachmentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(file: Express.Multer.File, dto: CreateChapterAttachmentDto, instructorId: string, role: Role) {
    await this.verifyChapterOwnership(dto.chapterId, instructorId, role);

    const fileUrl = await this.storage.uploadFile(file, 'courses');
    
    return this.prisma.chapterAttachment.create({
      data: {
        title: dto.title || file.originalname,
        chapterId: dto.chapterId,
        fileUrl: fileUrl,
      },
    });
  }

  async findAllByChapter(chapterId: string) {
    return this.prisma.chapterAttachment.findMany({
      where: { chapterId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(id: string, instructorId: string, role: Role) {
    const attachment = await this.prisma.chapterAttachment.findUnique({
      where: { id },
      include: { chapter: { select: { courseId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.verifyCourseOwnership(attachment.chapter.courseId, instructorId, role);

    return this.prisma.chapterAttachment.delete({
      where: { id },
    });
  }

  private async verifyChapterOwnership(chapterId: string, instructorId: string, role: Role) {
    if (role === Role.ADMIN) return;

    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, },
      select: { courseId: true },
    });
    if (!chapter)
      throw new ForbiddenException('You do not have permission to modify attachments in this course.');

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId: chapter.courseId, instructorId, },
    });
    if (!mapping)
      throw new ForbiddenException('You do not have permission to modify attachments in this course.');
  }

  private async verifyCourseOwnership(courseId: string | null, instructorId: string, role: Role) {
    if (role === Role.ADMIN || !courseId) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });
    if (!mapping)
      throw new ForbiddenException('You do not have permission to delete this attachment.');
  }
}

