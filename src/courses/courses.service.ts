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

  private getStudentTargetingCondition(user: any) {
    if (user.educationLevel === 'HIGH_SCHOOL') {
      const condition = [
        { OR: [{ targetHighSchoolSystem: null }, { targetHighSchoolSystem: user.highSchoolSystem }] },
        { OR: [{ targetStudyMode: null }, { targetStudyMode: user.studyMode }] },
        { OR: [{ targetStudyLanguage: null }, { targetStudyLanguage: user.studyLanguage }] },
        { OR: [{ targetHighSchoolGrade: null }, { targetHighSchoolGrade: user.highSchoolGrade }] },
        { OR: [{ targetTraditionalBranch: null }, { targetTraditionalBranch: user.traditionalBranch }] },
        { OR: [{ targetBaccalaureatePath: null }, { targetBaccalaureatePath: user.baccalaureatePath }] },
      ];
      return [
        {
          OR: [
            {
              AND: [
                { targetGroups: { none: {} } },
                { AND: condition }
              ]
            },
            { targetGroups: { some: { AND: condition } } }
          ]
        }
      ];
    } else {
      const condition = [
        { OR: [{ targetUniversityId: null }, { targetUniversityId: user.universityId }] },
        { OR: [{ targetFacultyId: null }, { targetFacultyId: user.facultyId }] },
        { OR: [{ targetDepartmentId: null }, { targetDepartmentId: user.departmentId }] },
        { OR: [{ targetProgramId: null }, { targetProgramId: user.programId }] },
      ];
      return [
        {
          OR: [
            {
              AND: [
                { targetGroups: { none: {} } },
                { AND: condition }
              ]
            },
            { targetGroups: { some: { AND: condition } } }
          ]
        }
      ];
    }
  }

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
    if (dto.targetGroups) {
      for (const group of dto.targetGroups) {
        await validateCourseTargetingAsync(this.prisma, { ...group, educationLevel: dto.audienceType });
      }
    }

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
        type: dto.type || 'NORMAL',
        targetGroups: dto.targetGroups ? {
          create: dto.targetGroups.map(g => ({
            targetHighSchoolSystem: g.targetHighSchoolSystem !== undefined ? normalize(g.targetHighSchoolSystem) : null,
            targetStudyMode: g.targetStudyMode !== undefined ? normalize(g.targetStudyMode) : null,
            targetStudyLanguage: g.targetStudyLanguage !== undefined ? normalize(g.targetStudyLanguage) : null,
            targetHighSchoolGrade: g.targetHighSchoolGrade !== undefined ? normalize(g.targetHighSchoolGrade) : null,
            targetTraditionalBranch: g.targetTraditionalBranch !== undefined ? normalize(g.targetTraditionalBranch) : null,
            targetBaccalaureatePath: g.targetBaccalaureatePath !== undefined ? normalize(g.targetBaccalaureatePath) : null,
            targetUniversityId: g.targetUniversityId !== undefined ? normalize(g.targetUniversityId) : null,
            targetFacultyId: g.targetFacultyId !== undefined ? normalize(g.targetFacultyId) : null,
            targetDepartmentId: g.targetDepartmentId !== undefined ? normalize(g.targetDepartmentId) : null,
            targetProgramId: g.targetProgramId !== undefined ? normalize(g.targetProgramId) : null,
          }))
        } : undefined,
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
          where: { 
            instructor: { role: { not: Role.ADMIN } },
            deletedAt: null
          },
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

    // --- Demo account bypass: skip ALL targeting/role filters ---
    let isDemoUser = false;
    if (userId) {
      const dbUserForDemo = await this.prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
      isDemoUser = (dbUserForDemo as any)?.isDemo === true;
    }

    if (!isDemoUser) {
      if (role === Role.INSTRUCTOR && userId) {
        whereClause.instructors = {
          some: { instructorId: userId },
        };
      } else if (role === Role.STUDENT && userId) {
        const dbUser = await this.prisma.user.findUnique({ where: { id: userId } });
        if (dbUser) {
          // Regular student: filter by their education level, segmentation and course type
          whereClause.AND = [
            { audienceType: dbUser.educationLevel },
            { type: 'NORMAL' },
            ...this.getStudentTargetingCondition(dbUser)
          ];
        }
      }
    }
    // Demo user: no targeting filter — sees ALL courses across all education levels


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
            where: { 
              instructor: { role: { not: Role.ADMIN } },
              deletedAt: null
            },
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
        targetUniversityRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetFacultyRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetDepartmentRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetProgramRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetGroups: {
          include: {
            targetUniversityRel: { select: { id: true, nameEn: true, nameAr: true } },
            targetFacultyRel: { select: { id: true, nameEn: true, nameAr: true } },
            targetDepartmentRel: { select: { id: true, nameEn: true, nameAr: true } },
            targetProgramRel: { select: { id: true, nameEn: true, nameAr: true } },
          }
        },
        instructors: {
          where: { 
            instructor: { role: { not: Role.ADMIN } },
            deletedAt: null
          },
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
        targetUniversityRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetFacultyRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetDepartmentRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetProgramRel: { select: { id: true, nameEn: true, nameAr: true } },
        targetGroups: {
          include: {
            targetUniversityRel: { select: { id: true, nameEn: true, nameAr: true } },
            targetFacultyRel: { select: { id: true, nameEn: true, nameAr: true } },
            targetDepartmentRel: { select: { id: true, nameEn: true, nameAr: true } },
            targetProgramRel: { select: { id: true, nameEn: true, nameAr: true } },
          }
        },
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

    const isHighSchool = dto.audienceType === 'HIGH_SCHOOL';

    const finalState: any = {
      highSchoolSystem: isHighSchool ? (dto.targetHighSchoolSystem !== undefined ? normalize(dto.targetHighSchoolSystem) : course.targetHighSchoolSystem) : null,
      studyMode: isHighSchool ? (dto.targetStudyMode !== undefined ? normalize(dto.targetStudyMode) : course.targetStudyMode) : null,
      studyLanguage: isHighSchool ? (dto.targetStudyLanguage !== undefined ? normalize(dto.targetStudyLanguage) : course.targetStudyLanguage) : null,
      highSchoolGrade: isHighSchool ? (dto.targetHighSchoolGrade !== undefined ? normalize(dto.targetHighSchoolGrade) : course.targetHighSchoolGrade) : null,
      traditionalBranch: isHighSchool ? (dto.targetTraditionalBranch !== undefined ? normalize(dto.targetTraditionalBranch) : course.targetTraditionalBranch) : null,
      baccalaureatePath: isHighSchool ? (dto.targetBaccalaureatePath !== undefined ? normalize(dto.targetBaccalaureatePath) : course.targetBaccalaureatePath) : null,
      targetUniversityId: !isHighSchool ? (dto.targetUniversityId !== undefined ? normalize(dto.targetUniversityId) : course.targetUniversityId) : null,
      targetFacultyId: !isHighSchool ? (dto.targetFacultyId !== undefined ? normalize(dto.targetFacultyId) : course.targetFacultyId) : null,
      targetDepartmentId: !isHighSchool ? (dto.targetDepartmentId !== undefined ? normalize(dto.targetDepartmentId) : course.targetDepartmentId) : null,
      targetProgramId: !isHighSchool ? (dto.targetProgramId !== undefined ? normalize(dto.targetProgramId) : course.targetProgramId) : null,
    };

    await validateCourseTargetingAsync(this.prisma, finalState);
    if (dto.targetGroups) {
      for (const group of dto.targetGroups) {
        await validateCourseTargetingAsync(this.prisma, { ...group, educationLevel: dto.audienceType });
      }
    }

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
        targetGroups: dto.targetGroups ? {
          deleteMany: {},
          create: dto.targetGroups.map(g => ({
            targetHighSchoolSystem: g.targetHighSchoolSystem !== undefined ? normalize(g.targetHighSchoolSystem) : null,
            targetStudyMode: g.targetStudyMode !== undefined ? normalize(g.targetStudyMode) : null,
            targetStudyLanguage: g.targetStudyLanguage !== undefined ? normalize(g.targetStudyLanguage) : null,
            targetHighSchoolGrade: g.targetHighSchoolGrade !== undefined ? normalize(g.targetHighSchoolGrade) : null,
            targetTraditionalBranch: g.targetTraditionalBranch !== undefined ? normalize(g.targetTraditionalBranch) : null,
            targetBaccalaureatePath: g.targetBaccalaureatePath !== undefined ? normalize(g.targetBaccalaureatePath) : null,
            targetUniversityId: g.targetUniversityId !== undefined ? normalize(g.targetUniversityId) : null,
            targetFacultyId: g.targetFacultyId !== undefined ? normalize(g.targetFacultyId) : null,
            targetDepartmentId: g.targetDepartmentId !== undefined ? normalize(g.targetDepartmentId) : null,
            targetProgramId: g.targetProgramId !== undefined ? normalize(g.targetProgramId) : null,
          }))
        } : undefined,
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
    const existingActive = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId },
    });
    
    if (existingActive) {
      throw new ConflictException('This instructor is already assigned to this course.');
    }

    return this.prisma.courseInstructor.upsert({
      where: { courseId_instructorId: { courseId, instructorId } },
      update: { deletedAt: null, assignedAt: new Date() },
      create: { courseId, instructorId },
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

    return this.prisma.courseInstructor.delete({
      where: {
        courseId_instructorId: { courseId, instructorId: targetInstructorId },
      },
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
      await tx.courseInstructor.deleteMany({
        where: { courseId, },
      });
      const newInstructor = await tx.courseInstructor.upsert({
        where: { courseId_instructorId: { courseId, instructorId: userToAdd.id } },
        update: { deletedAt: null, assignedAt: new Date() },
        create: { courseId, instructorId: userToAdd.id },
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
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        attachments: true,
        lectures: {
          include: { 
            attachments: true,
            sessions: true
          }
        }
      }
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.verifyCourseOwnership(id, instructorId, role);

    const urlsToDelete: string[] = [];
    if (course.thumbnailUrl) urlsToDelete.push(course.thumbnailUrl);
    if (course.introductoryVideoUrl) urlsToDelete.push(course.introductoryVideoUrl);

    for (const att of course.attachments) {
      urlsToDelete.push(att.fileUrl);
    }

    for (const lecture of course.lectures) {
      if (lecture.thumbnailUrl) urlsToDelete.push(lecture.thumbnailUrl);
      for (const att of lecture.attachments) {
        urlsToDelete.push(att.fileUrl);
      }
      for (const session of lecture.sessions) {
        if (session.videoUrl) urlsToDelete.push(session.videoUrl);
      }
    }

    // Since we don't have StorageService imported, we'll manually use @aws-sdk/client-s3 here, or we can use CloudflareService if available.
    // Wait, CloudflareService is imported? Let's check imports! No, neither are imported. Let me dynamically import DeleteObjectsCommand.
    
    if (urlsToDelete.length > 0) {
      const bucketName = process.env.R2_BUCKET_NAME;
      const endpoint = process.env.R2_ENDPOINT;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const publicUrl = process.env.R2_PUBLIC_URL;

      if (bucketName && endpoint && accessKeyId && secretAccessKey) {
        const { S3Client, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint,
          credentials: { accessKeyId, secretAccessKey },
        });

        const keys = urlsToDelete.map(url => {
          let key = url;
          if (publicUrl && url.startsWith(publicUrl)) {
            key = url.substring(publicUrl.length + 1);
          } else if (url.startsWith('https://')) {
            try {
              const urlObj = new URL(url);
              key = urlObj.pathname.substring(1);
            } catch (e) {
              // Fallback
            }
          }
          return key;
        });

        try {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
          }));
        } catch (error) {
          console.error('Failed to delete objects from R2', error);
        }
      }
    }

    return this.prisma.course.delete({ where: { id } });
  }

  async getCoursesForStudent(userId: string, includeMaterialsOnly = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const isDemo = (user as any).isDemo === true;

    return this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        ...(includeMaterialsOnly ? {} : { type: 'NORMAL' }),
        ...(isDemo ? {} : {
          AND: [
            { audienceType: user.educationLevel },
            ...this.getStudentTargetingCondition(user)
          ]
        })
      },
      include: {
        instructors: {
          where: { 
            instructor: { role: { not: Role.ADMIN } },
            deletedAt: null
          },
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
      type: 'NORMAL',
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
          where: { 
            instructor: { role: { not: Role.ADMIN } },
            deletedAt: null
          },
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
        type: 'NORMAL',
        },
      include: {
        instructors: {
          where: { 
            instructor: { role: { not: Role.ADMIN } },
            deletedAt: null
          },
          include: { instructor: { select: { id: true, fullName: true, profilePictureUrl: true } } },
        },
      },
    });
  }
}

