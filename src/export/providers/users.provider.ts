import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class UsersProvider implements DataProvider {
  entity = 'users';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = {};

    if (!filters?.includeDeleted) {
      where.deletedAt = null;
    }
    if (filters?.role) where.role = filters.role;
    if (filters?.educationLevel) where.educationLevel = filters.educationLevel;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters?.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search, mode: 'insensitive' } },
        { parentPhoneNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { 
        id: true, fullName: true, email: true, role: true, isActive: true, 
        educationLevel: true, highSchoolSystem: true, studyMode: true, studyLanguage: true,
        highSchoolGrade: true, traditionalBranch: true, baccalaureatePath: true,
        universityId: true, facultyId: true, departmentId: true, programId: true,
        otherUniversityName: true, otherFacultyName: true, otherDepartmentName: true, otherProgramName: true,
        academicUniversity: { select: { nameAr: true } },
        academicFaculty: { select: { nameAr: true } },
        academicDepartment: { select: { nameAr: true } },
        academicProgram: { select: { nameAr: true } },
        phoneNumber: true, createdAt: true, lastLoginAt: true, xp: true 
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'fullName', label: 'Full Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { key: 'isActive', label: 'Active' },
        { key: 'educationLevel', label: 'Education Level' },
        { key: 'highSchoolSystem', label: 'High School System' },
        { key: 'studyMode', label: 'Study Mode' },
        { key: 'studyLanguage', label: 'Study Language' },
        { key: 'highSchoolGrade', label: 'High School Grade' },
        { key: 'traditionalBranch', label: 'Traditional Branch' },
        { key: 'baccalaureatePath', label: 'Baccalaureate Path' },
        { key: 'university', label: 'University' },
        { key: 'faculty', label: 'Faculty' },
        { key: 'department', label: 'Department' },
        { key: 'program', label: 'Program' },
        { key: 'phoneNumber', label: 'Phone' },
        { key: 'createdAt', label: 'Created At' },
        { key: 'lastLoginAt', label: 'Last Login' },
        { key: 'xp', label: 'XP' },
      ],
      data: users.map((u) => ({
        ...u,
        isActive: u.isActive ? 'Yes' : 'No',
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() || '',
        university: u.academicUniversity?.nameAr || u.otherUniversityName || '',
        faculty: u.academicFaculty?.nameAr || u.otherFacultyName || '',
        department: u.academicDepartment?.nameAr || u.otherDepartmentName || '',
        program: u.academicProgram?.nameAr || u.otherProgramName || '',
      })),
    };
  }
}
