import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { Role } from '@prisma/client';
@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  private async verifyCourseOwnership(
    courseId: string,
    instructorId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });

    if (!mapping) {
      throw new ForbiddenException(
        'You are not authorized to modify this course.',
      );
    }
  }

  async create(dto: CreateCourseDto, instructorId: string, role: Role) {
    return this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        audienceType: dto.audienceType,
        ...(role === Role.INSTRUCTOR && {
          instructors: {
            create: {
              instructorId: instructorId,
            },
          },
        }),
      },
      include: {
        instructors: {
          where: { instructor: { role: { not: Role.ADMIN } } },
          include: {
            instructor: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findAll(
    userId?: string,
    role?: Role,
    skip: number = 0,
    take: number = 50,
    search?: string,
    isPublished?: boolean
  ) {
    const whereClause: any = {
      // Filter out soft-deleted courses
    };
    if (role === Role.INSTRUCTOR && userId) {
      whereClause.instructors = {
        some: { instructorId: userId },
      };
    }
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isPublished !== undefined) {
      whereClause.status = isPublished ? 'PUBLISHED' : 'DRAFT';
    }

    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where: whereClause,
        skip,
        take,
        include: {
          instructors: {
            where: { instructor: { role: { not: Role.ADMIN } } },
            include: {
              instructor: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.course.count({ where: whereClause }),
    ]);

    return { items, total, skip, take };
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, },
      include: {
        instructors: {
          where: { instructor: { role: { not: Role.ADMIN } } },
          include: {
            instructor: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }

    return course;
  }

  async getBuilderData(id: string, instructorId: string, role: Role) {
    await this.verifyCourseOwnership(id, instructorId, role);

    const course = await this.prisma.course.findFirst({
      where: { id, },
      include: {
        chapters: {
          where: { deletedAt: null },
          orderBy: { orderIndex: 'asc' },
          include: {
            lectures: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              include: {
                sessions: {
                  where: { deletedAt: null },
                },
                quizzes: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        },
        lectures: {
          where: { chapterId: null, deletedAt: null }, // unassigned lectures
          orderBy: { sortOrder: 'asc' },
          include: {
            sessions: {
              where: { deletedAt: null },
            },
            quizzes: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!course) throw new NotFoundException('Course not found');

    const formatLecture = (lec: any) => {
      const items = [
        ...lec.sessions.map((s) => ({ ...s, type: 'SESSION' })),
        ...lec.quizzes.map((q) => ({ ...q, type: 'QUIZ' })),
      ].sort((a: any, b: any) => a.sortOrder - b.sortOrder);

      return {
        id: lec.id,
        title: lec.title,
        description: lec.description,
        sortOrder: lec.sortOrder,
        chapterId: lec.chapterId,
        items,
      };
    };

    const formattedChapters = course.chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      description: ch.description,
      orderIndex: ch.orderIndex,
      lectures: ch.lectures.map(formatLecture),
    }));

    const unassignedLectures = course.lectures.map(formatLecture);

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        status: course.status,
        audienceType: course.audienceType,
        thumbnailUrl: course.thumbnailUrl,
        introductoryVideoUrl: course.introductoryVideoUrl,
      },
      chapters: formattedChapters,
      unassignedLectures,
    };
  }

  
  async updateIntro(courseId: string, url: string, userId: string, role: Role) {
    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: { courseId, instructorId: userId, },
      });
      if (!mapping) throw new ForbiddenException('Not authorized');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { introductoryVideoUrl: url },
    });
  }

  async addAttachments(courseId: string, attachments: { title: string; fileUrl: string }[], userId: string, role: Role) {
    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: { courseId, instructorId: userId, },
      });
      if (!mapping) throw new ForbiddenException('Not authorized');
    }
    
    return this.prisma.$transaction(
      attachments.map(att => 
        this.prisma.courseAttachment.create({
          data: {
            courseId,
            title: att.title,
            fileUrl: att.fileUrl
          }
        })
      )
    );
  }

  async publish(courseId: string, userId: string, role: Role) {
    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: { courseId, instructorId: userId, },
      });
      if (!mapping) throw new ForbiddenException('Not authorized');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'PUBLISHED' },
    });
  }

  async unpublish(courseId: string, userId: string, role: Role) {
    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: { courseId, instructorId: userId, },
      });
      if (!mapping) throw new ForbiddenException('Not authorized');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'DRAFT' },
    });
  }

  async update(
    id: string,
    dto: CreateCourseDto,
    instructorId: string,
    role: Role,
  ) {
    await this.findOne(id);
    await this.verifyCourseOwnership(id, instructorId, role);
    return this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        audienceType: dto.audienceType,
      },
    });
  }

  async updateStatus(
    id: string,
    status: any,
    instructorId: string,
    role: Role,
  ) {
    await this.findOne(id);
    await this.verifyCourseOwnership(id, instructorId, role);
    return this.prisma.course.update({
      where: { id },
      data: { status },
    });
  }

  async assignInstructor(courseId: string, instructorId: string) {
    const existing = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });
    if (existing) throw new ConflictException('This instructor is already assigned to this course.');

    return this.prisma.courseInstructor.create({
      data: { courseId, instructorId },
    });
  }

  async removeInstructor(
    courseId: string,
    targetInstructorId: string,
    requestorId: string,
    role: Role,
  ) {
    await this.verifyCourseOwnership(courseId, requestorId, role);

    // Prevent removing the last instructor
    const count = await this.prisma.courseInstructor.count({
      where: { courseId, },
    });
    if (count <= 1) {
      throw new BadRequestException(
        'Cannot remove the last instructor from a course',
      );
    }

    return this.prisma.courseInstructor.update({
      where: {
        courseId_instructorId: { courseId, instructorId: targetInstructorId },
      },
      data: { deletedAt: new Date() },
    });
  }

  async transferOwnership(courseId: string, newOwnerEmail: string) {
    // Only admins call this (controller will enforce @Roles(Role.ADMIN))
    const userToAdd = await this.prisma.user.findUnique({
      where: { email: newOwnerEmail },
    });
    if (
      !userToAdd ||
      (userToAdd.role !== Role.INSTRUCTOR && userToAdd.role !== Role.ADMIN)
    ) {
      throw new BadRequestException('User not found or is not an instructor');
    }

    // Wrap in transaction: clear old instructors, set new one, log it
    return this.prisma.$transaction(async (tx) => {
      await tx.courseInstructor.updateMany({
        where: { courseId, },
        data: { deletedAt: new Date() },
      });
      const newInstructor = await tx.courseInstructor.create({
        data: { courseId, instructorId: userToAdd.id },
      });
      await tx.auditLog.create({
        data: {
          action: 'TRANSFER_COURSE_OWNERSHIP',
          entity: 'Course',
          entityId: courseId,
          details: JSON.stringify({ newOwner: userToAdd.id }),
        },
      });
      return newInstructor;
    });
  }

  async updateThumbnail(
    id: string,
    thumbnailUrl: string,
    instructorId: string,
    role: Role,
  ) {
    await this.findOne(id);
    await this.verifyCourseOwnership(id, instructorId, role);
    return this.prisma.course.update({
      where: { id },
      data: { thumbnailUrl },
    });
  }

  async remove(id: string, instructorId: string, role: Role) {
    await this.findOne(id);
    await this.verifyCourseOwnership(id, instructorId, role);
    return this.prisma.course.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getCoursesForStudent(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { educationLevel: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    return this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        audienceType: user.educationLevel,
      },
      include: {
        instructors: {
          where: { instructor: { role: { not: Role.ADMIN } } },
          include: {
            instructor: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        lectures: {
          where: {
            },
          select: {
            id: true,
            title: true,
            description: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // --- PUBLIC CATALOG ENDPOINT (CACHED) ---
  async getPublishedCourses(audienceType?: any) {
    const whereClause: any = {
      status: 'PUBLISHED',
      };
    if (audienceType) {
      whereClause.audienceType = audienceType;
    }

    return this.prisma.course.findMany({
      where: whereClause,
      // Fetch all courses, but only include published lectures
      include: {
        // Get the instructor's name (but hide their sensitive data like email/password)
        instructors: {
          where: { instructor: { role: { not: Role.ADMIN } } },
          include: {
            instructor: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        // Only show lectures that are officially published so students don't see drafts
        lectures: {
          where: {
            },
          select: {
            id: true,
            title: true,
            description: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Show newest courses first
      },
    });
  }

  async findAllForStudents(level: 'HIGH_SCHOOL' | 'UNIVERSITY') {
    return this.prisma.course.findMany({
      where: {
        audienceType: level,
        status: 'PUBLISHED',
        },
      include: {
        instructors: {
          where: { instructor: { role: { not: Role.ADMIN } } },
          include: { instructor: { select: { id: true, fullName: true, profilePictureUrl: true } } },
        },
      },
    });
  }
}

