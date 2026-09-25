import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { Role } from '@prisma/client';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  private async verifySessionOwnership(
    lectureId: string,
    instructorId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;

    const lecture = await this.prisma.lecture.findUnique({
      where: { id: lectureId },
      select: { courseId: true },
    });

    if (!lecture) throw new NotFoundException('Parent lecture not found');

    // Allow operation for unassigned lectures (courseId is null).
    // These are draft lectures visible only to the instructor who created them.
    if (!lecture.courseId) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId: lecture.courseId, instructorId, },
    });

    if (!mapping) {
      throw new ForbiddenException(
        'You do not have permission to modify sessions in this lecture.',
      );
    }
  }

  async verifySessionOwnershipById(sessionId: string, instructorId: string, role: Role) {
    const session = await this.findOne(sessionId);
    await this.verifySessionOwnership(session.lectureId, instructorId, role);
  }

  async create(dto: CreateSessionDto, instructorId: string, role: Role) {
    await this.verifySessionOwnership(dto.lectureId, instructorId, role);

    return this.prisma.session.create({
      data: dto,
    });
  }

  async findByLecture(lectureId: string) {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: lectureId, },
    });
    if (!lecture) throw new NotFoundException('Lecture not found');

    return this.prisma.session.findMany({
      where: { lectureId, },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, },
    });
    if (!session)
      throw new NotFoundException(`Session with ID ${id} not found`);
    return session;
  }

  async update(
    id: string,
    dto: Partial<CreateSessionDto>,
    instructorId: string,
    role: Role,
  ) {
    const session = await this.findOne(id);
    await this.verifySessionOwnership(session.lectureId, instructorId, role);

    return this.prisma.session.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, instructorId: string, role: Role) {
    const session = await this.findOne(id);
    await this.verifySessionOwnership(session.lectureId, instructorId, role);

    const [deleted] = await this.prisma.$transaction([
      this.prisma.session.delete({ where: { id } }),
      // Re-index remaining sessions in the same lecture to fill ordering gaps
      this.prisma.$executeRaw`
        UPDATE "Session"
        SET "orderIndex" = sub.new_index
        FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY "orderIndex" ASC, "createdAt" ASC) - 1 AS new_index
          FROM "Session"
          WHERE "lectureId" = ${session.lectureId} AND "deletedAt" IS NULL
        ) sub
        WHERE "Session".id = sub.id
      `,
    ]);

    return deleted;
  }

  async updateVideoUrl(
    id: string,
    videoUrl: string,
    instructorId: string,
    role: Role,
  ) {
    const session = await this.findOne(id);
    await this.verifySessionOwnership(session.lectureId, instructorId, role);

    return this.prisma.session.update({
      where: { id },
      data: { videoUrl },
      select: { id: true, title: true, videoUrl: true },
    });
  }
}

