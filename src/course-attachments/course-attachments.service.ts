import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCourseAttachmentDto } from './dto/create-course-attachment.dto';
import { Role } from '@prisma/client';

@Injectable()
export class CourseAttachmentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(file: Express.Multer.File, dto: CreateCourseAttachmentDto, instructorId: string, role: Role) {
    await this.verifyCourseOwnership(dto.courseId, instructorId, role);

    const fileUrl = await this.storage.uploadFile(file, 'courses');
    
    return this.prisma.courseAttachment.create({
      data: {
        title: dto.title || file.originalname,
        courseId: dto.courseId,
        fileUrl: fileUrl,
      },
    });
  }

  async findAllByCourse(courseId: string) {
    return this.prisma.courseAttachment.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(id: string, instructorId: string, role: Role) {
    const attachment = await this.prisma.courseAttachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.verifyCourseOwnership(attachment.courseId, instructorId, role);

    return this.prisma.courseAttachment.delete({
      where: { id },
    });
  }

  private async verifyCourseOwnership(courseId: string, instructorId: string, role: Role) {
    if (role === Role.ADMIN) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });
    if (!mapping)
      throw new ForbiddenException('You do not have permission to modify attachments in this course.');
  }
}

