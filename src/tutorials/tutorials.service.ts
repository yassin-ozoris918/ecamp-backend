import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, CreateTutorialDto, UpdateTutorialDto } from './dto/tutorial.dto';
import { Role } from '@prisma/client';

@Injectable()
export class TutorialsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.helpCategory.create({
      data: dto,
    });
  }

  async updateCategory(id: string, dto: Partial<CreateCategoryDto>) {
    return this.prisma.helpCategory.update({
      where: { id },
      data: dto,
    });
  }

  async findAllCategories(includeInactive: boolean = false) {
    return this.prisma.helpCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createTutorial(dto: CreateTutorialDto) {
    const { targetGroups, ...rest } = dto;
    return this.prisma.helpVideo.create({
      data: {
        ...rest,
        targetGroups: {
          create: targetGroups || [],
        },
      },
      include: { targetGroups: true, category: true },
    });
  }

  async updateTutorial(id: string, dto: UpdateTutorialDto) {
    const { targetGroups, ...rest } = dto;
    
    if (targetGroups) {
      // replace target groups
      await this.prisma.helpVideoTargetGroup.deleteMany({
        where: { helpVideoId: id },
      });
    }

    return this.prisma.helpVideo.update({
      where: { id },
      data: {
        ...rest,
        ...(targetGroups ? { targetGroups: { create: targetGroups } } : {}),
      },
      include: { targetGroups: true, category: true },
    });
  }

  async deleteTutorial(id: string) {
    return this.prisma.helpVideo.delete({
      where: { id },
    });
  }

  async findAllTutorials(includeInactive: boolean = false) {
    return this.prisma.helpVideo.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { category: true, targetGroups: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateTutorialVideoUrl(id: string, url: string) {
    return this.prisma.helpVideo.update({
      where: { id },
      data: { cloudflareId: url },
    });
  }

  async findTutorialsForStudent(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        academicUniversity: true,
        academicFaculty: true,
        academicDepartment: true,
        academicProgram: true,
      },
    });

    if (!student) throw new NotFoundException('Student not found');

    const allActiveTutorials = await this.prisma.helpVideo.findMany({
      where: { isActive: true },
      include: { targetGroups: true, category: true },
      orderBy: { sortOrder: 'asc' },
    });

    return allActiveTutorials.filter(tutorial => {
      if (tutorial.isPublic) return true;
      if (tutorial.targetGroups.length === 0) return true; // fallback

      // Check if student matches ANY of the target groups
      return tutorial.targetGroups.some(group => {
        // High School targeting
        if (student.educationLevel === 'HIGH_SCHOOL') {
          if (group.targetHighSchoolSystem && group.targetHighSchoolSystem !== student.highSchoolSystem) return false;
          if (group.targetStudyMode && group.targetStudyMode !== student.studyMode) return false;
          if (group.targetStudyLanguage && group.targetStudyLanguage !== student.studyLanguage) return false;
          if (group.targetHighSchoolGrade && group.targetHighSchoolGrade !== student.highSchoolGrade) return false;
          if (group.targetTraditionalBranch && group.targetTraditionalBranch !== student.traditionalBranch) return false;
          if (group.targetBaccalaureatePath && group.targetBaccalaureatePath !== student.baccalaureatePath) return false;
          // If the group targets university properties, it's not a match for high school
          if (group.targetUniversityId || group.targetFacultyId || group.targetDepartmentId || group.targetProgramId) return false;
          return true;
        } 
        // University targeting
        else if (student.educationLevel === 'UNIVERSITY') {
          if (group.targetUniversityId && group.targetUniversityId !== student.universityId) return false;
          if (group.targetFacultyId && group.targetFacultyId !== student.facultyId) return false;
          if (group.targetDepartmentId && group.targetDepartmentId !== student.departmentId) return false;
          if (group.targetProgramId && group.targetProgramId !== student.programId) return false;
          // If the group targets high school properties, it's not a match
          if (group.targetHighSchoolSystem || group.targetHighSchoolGrade || group.targetStudyMode || group.targetStudyLanguage) return false;
          return true;
        }
        return false;
      });
    });
  }

  async findOneTutorialForStudent(id: string, studentId: string) {
    const tutorials = await this.findTutorialsForStudent(studentId);
    const found = tutorials.find(t => t.id === id);
    if (!found) throw new ForbiddenException('Access denied or tutorial not found');
    return found;
  }
}
