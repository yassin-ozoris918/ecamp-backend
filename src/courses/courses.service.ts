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
import { validateCourseTargeting, validateCourseTargetingAsync } from '../common/utils/segmentation-validation.util';
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
    const normalize = (val: any) => (val === null || val === '') ? null : val;
    const finalState = {
      highSchoolSystem: dto.targetHighSchoolSystem !== undefined ? normalize(dto.targetHighSchoolSystem) : null,
      studyMode: dto.targetStudyMode !== undefined ? normalize(dto.targetStudyMode) : null,
      studyLanguage: dto.targetStudyLanguage !== undefined ? normalize(dto.targetStudyLanguage) : null,
      highSchoolGrade: dto.targetHighSchoolGrade !== undefined ? normalize(dto.targetHighSchoolGrade) : null,
      traditionalBranch: dto.targetTraditionalBranch !== undefined ? normalize(dto.targetTraditionalBranch) : null,
      baccalaureatePath: dto.targetBaccalaureatePath !== undefined ? normalize(dto.targetBaccalaureatePath) : null,
      targetUniversityId: dto.targetUniversityId !== undefined ? normalize(dto.targetUniversityId) : null,
      targetFacultyId: dto.targetFacultyId !== undefined ? normalize(dto.targetFacultyId) : null,
      targetDepartmentId: dto.targetDepartmentId !== undefined ? normalize(dto.targetDepartmentId) : null,
      targetProgramId: dto.targetProgramId !== undefined ? normalize(dto.targetProgramId) : null,
    };

    await validateCourseTargetingAsync(this.prisma, finalState);

    return this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        audienceType: dto.audienceType,
        isFree: dto.isFree || false,
        targetHighSchoolSystem: finalState.highSchoolSystem,
        targetStudyMode: finalState.studyMode,
        targetStudyLanguage: finalState.studyLanguage,
        targetHighSchoolGrade: finalState.highSchoolGrade,
        targetTraditionalBranch: finalState.traditionalBranch,
        targetBaccalaureatePath: finalState.baccalaureatePath,
        targetUniversityId: dto.targetUniversityId !== undefined ? normalize(dto.targetUniversityId) : null,
        targetFacultyId: dto.targetFacultyId !== undefined ? normalize(dto.targetFacultyId) : null,
        targetDepartmentId: dto.targetDepartmentId !== undefined ? normalize(dto.targetDepartmentId) : null,
        targetProgramId: dto.targetProgramId !== undefined ? normalize(dto.targetProgramId) : null,
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
    } else if (role === Role.STUDENT && userId) {
      const dbUser = await this.prisma.user.findUnique({ where: { id: userId } });
      if (dbUser) {
        whereClause.AND = [
          { audienceType: dbUser.educationLevel },
          ...(dbUser.educationLevel === 'HIGH_SCHOOL' ? [
            { OR: [{ targetHighSchoolSystem: null }, { targetHighSchoolSystem: dbUser.highSchoolSystem }] },
            { OR: [{ targetStudyMode: null }, { targetStudyMode: dbUser.studyMode }] },
            { OR: [{ targetStudyLanguage: null }, { targetStudyLanguage: dbUser.studyLanguage }] },
            { OR: [{ targetHighSchoolGrade: null }, { targetHighSchoolGrade: dbUser.highSchoolGrade }] },
            { OR: [{ targetTraditionalBranch: null }, { targetTraditionalBranch: dbUser.traditionalBranch }] },
            { OR: [{ targetBaccalaureatePath: null }, { targetBaccalaureatePath: dbUser.baccalaureatePath }] },
          ] : [
            { OR: [{ targetUniversityId: null }, { targetUniversityId: dbUser.universityId }] },
            { OR: [{ targetFacultyId: null }, { targetFacultyId: dbUser.facultyId }] },
            { OR: [{ targetDepartmentId: null }, { targetDepartmentId: dbUser.departmentId }] },
            { OR: [{ targetProgramId: null }, { targetProgramId: dbUser.programId }] },
          ])
        ];
      }
    }

    if (search) {
      const searchOr = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
      if (whereClause.OR) {
        whereClause.AND = [
          { OR: whereClause.OR },
          { OR: searchOr }
        ];
        delete whereClause.OR;
      } else {
        whereClause.OR = searchOr;
      }
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
        isFree: course.isFree,
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
    const course = await this.findOne(id);
    await this.verifyCourseOwnership(id, instructorId, role);
    
    const normalize = (val: any) => val === '' ? null : val;

    const finalState: any = {
      highSchoolSystem: dto.targetHighSchoolSystem !== undefined ? normalize(dto.targetHighSchoolSystem) : course.targetHighSchoolSystem,
      studyMode: dto.targetStudyMode !== undefined ? normalize(dto.targetStudyMode) : course.targetStudyMode,
      studyLanguage: dto.targetStudyLanguage !== undefined ? normalize(dto.targetStudyLanguage) : course.targetStudyLanguage,
      highSchoolGrade: dto.targetHighSchoolGrade !== undefined ? normalize(dto.targetHighSchoolGrade) : course.targetHighSchoolGrade,
      traditionalBranch: dto.targetTraditionalBranch !== undefined ? normalize(dto.targetTraditionalBranch) : course.targetTraditionalBranch,
      baccalaureatePath: dto.targetBaccalaureatePath !== undefined ? normalize(dto.targetBaccalaureatePath) : course.targetBaccalaureatePath,
      targetUniversityId: dto.targetUniversityId !== undefined ? normalize(dto.targetUniversityId) : course.targetUniversityId,
      targetFacultyId: dto.targetFacultyId !== undefined ? normalize(dto.targetFacultyId) : course.targetFacultyId,
      targetDepartmentId: dto.targetDepartmentId !== undefined ? normalize(dto.targetDepartmentId) : course.targetDepartmentId,
      targetProgramId: dto.targetProgramId !== undefined ? normalize(dto.targetProgramId) : course.targetProgramId,
    };

    await validateCourseTargetingAsync(this.prisma, finalState);

    return this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        audienceType: dto.audienceType,
        isFree: dto.isFree,
        targetHighSchoolSystem: finalState.highSchoolSystem,
        targetStudyMode: finalState.studyMode,
        targetStudyLanguage: finalState.studyLanguage,
        targetHighSchoolGrade: finalState.highSchoolGrade,
        targetTraditionalBranch: finalState.traditionalBranch,
        targetBaccalaureatePath: finalState.baccalaureatePath,
        targetUniversityId: dto.targetUniversityId !== undefined ? normalize(dto.targetUniversityId) : course.targetUniversityId,
        targetFacultyId: dto.targetFacultyId !== undefined ? normalize(dto.targetFacultyId) : course.targetFacultyId,
        targetDepartmentId: dto.targetDepartmentId !== undefined ? normalize(dto.targetDepartmentId) : course.targetDepartmentId,
        targetProgramId: dto.targetProgramId !== undefined ? normalize(dto.targetProgramId) : course.targetProgramId,
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
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    return this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        AND: [
          { audienceType: user.educationLevel },
          ...(user.educationLevel === 'HIGH_SCHOOL' ? [
            { OR: [{ targetHighSchoolSystem: null }, { targetHighSchoolSystem: user.highSchoolSystem }] },
            { OR: [{ targetStudyMode: null }, { targetStudyMode: user.studyMode }] },
            { OR: [{ targetStudyLanguage: null }, { targetStudyLanguage: user.studyLanguage }] },
            { OR: [{ targetHighSchoolGrade: null }, { targetHighSchoolGrade: user.highSchoolGrade }] },
            { OR: [{ targetTraditionalBranch: null }, { targetTraditionalBranch: user.traditionalBranch }] },
            { OR: [{ targetBaccalaureatePath: null }, { targetBaccalaureatePath: user.baccalaureatePath }] },
          ] : [
            { OR: [{ targetUniversityId: null }, { targetUniversityId: user.universityId }] },
            { OR: [{ targetFacultyId: null }, { targetFacultyId: user.facultyId }] },
            { OR: [{ targetDepartmentId: null }, { targetDepartmentId: user.departmentId }] },
            { OR: [{ targetProgramId: null }, { targetProgramId: user.programId }] },
          ])
        ]
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

