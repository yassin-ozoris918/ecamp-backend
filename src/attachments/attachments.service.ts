import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(file: Express.Multer.File, dto: CreateAttachmentDto, instructorId: string, role: Role) {
    await this.verifyLectureOwnership(dto.lectureId, instructorId, role);

    const fileUrl = await this.storage.uploadFile(file, 'attachments');
    
    return this.prisma.attachment.create({
      data: {
        title: dto.title || file.originalname,
        lectureId: dto.lectureId,
        fileUrl: fileUrl,
        type: dto.type || 'OTHER',
      },
    });
  }

  async findAllByLecture(lectureId: string) {
    return this.prisma.attachment.findMany({
      where: { lectureId, },
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(id: string, instructorId: string, role: Role) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.verifyCourseOwnership(attachment.lecture.courseId, instructorId, role);

    return this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async verifyLectureOwnership(lectureId: string, instructorId: string, role: Role) {
    if (role === Role.ADMIN) return;

    const lecture = await this.prisma.lecture.findFirst({
      where: { id: lectureId, },
      select: { courseId: true },
    });
    if (!lecture || !lecture.courseId)
      throw new ForbiddenException('You do not have permission to modify attachments in this course.');

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId: lecture.courseId, instructorId, },
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

