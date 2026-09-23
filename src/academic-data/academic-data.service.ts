import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AcademicDataService {
  constructor(private readonly prisma: PrismaService) {}

  async getUniversities() {
    return this.prisma.academicUniversity.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getFacultiesByUniversity(universityId: string) {
    return this.prisma.academicFaculty.findMany({
      where: { universityId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getDepartmentsByFaculty(facultyId: string) {
    return this.prisma.academicDepartment.findMany({
      where: { facultyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getProgramsByDepartment(departmentId: string) {
    return this.prisma.academicProgram.findMany({
      where: { departmentId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getProgramsByFaculty(facultyId: string) {
    return this.prisma.academicProgram.findMany({
      where: { facultyId, departmentId: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
