import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { HighSchoolSystem, HighSchoolGrade, EducationLevel } from '@prisma/client';
import { validateStudentSegmentation, validateUniversitySegmentation } from '../common/utils/segmentation-validation.util';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  isProfileComplete(user: any): boolean {
    if (user.educationLevel === EducationLevel.HIGH_SCHOOL) {
      if (!user.highSchoolSystem || !user.studyMode || !user.studyLanguage || !user.highSchoolGrade) {
        return false;
      }
      if (user.highSchoolSystem === HighSchoolSystem.TRADITIONAL && 
         (user.highSchoolGrade === HighSchoolGrade.GRADE_2 || user.highSchoolGrade === HighSchoolGrade.GRADE_3) && 
         !user.traditionalBranch) {
        return false;
      }
      if (user.highSchoolSystem === HighSchoolSystem.BACCALAUREATE && 
         (user.highSchoolGrade === HighSchoolGrade.GRADE_2 || user.highSchoolGrade === HighSchoolGrade.GRADE_3) && 
         !user.baccalaureatePath) {
        return false;
      }
    } else if (user.educationLevel === EducationLevel.UNIVERSITY) {
      if (!user.universityId) return false;
      // Note: According to decisions, Other university must have name, but validateUniversitySegmentation 
      // enforces it. We can just check universityId here. Actually we should check both:
      if (user.academicUniversity?.isOther && !user.otherUniversityName) return false;
    }
    return true;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ 
      where: { id: userId },
      include: { academicUniversity: true }
    });
    if (!user) throw new UnauthorizedException('This account has been deactivated or deleted.');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.fullName,
      profilePictureUrl: user.profilePictureUrl,
      xp: user.xp,
      streak_days: user.streakDays,
      is_active: user.isActive,
      phone_number: user.phoneNumber,
      parent_phone_number: user.parentPhoneNumber,
      educationLevel: user.educationLevel,
      highSchoolSystem: user.highSchoolSystem,
      studyMode: user.studyMode,
      studyLanguage: user.studyLanguage,
      highSchoolGrade: user.highSchoolGrade,
      traditionalBranch: user.traditionalBranch,
      baccalaureatePath: user.baccalaureatePath,
      universityId: user.universityId,
      facultyId: user.facultyId,
      departmentId: user.departmentId,
      programId: user.programId,
      otherUniversityName: user.otherUniversityName,
      otherFacultyName: user.otherFacultyName,
      otherDepartmentName: user.otherDepartmentName,
      otherProgramName: user.otherProgramName,
      isProfileComplete: this.isProfileComplete(user),
    };
  }

  async updateAvatar(userId: string, profilePictureUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { profilePictureUrl },
      select: {
        id: true,
        email: true,
        fullName: true,
        profilePictureUrl: true,
        role: true,
        isActive: true,
        educationLevel: true,
        phoneNumber: true,
        parentPhoneNumber: true,
      },
    });
  }

  async updatePassword(userId: string, current: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(current, user.password);
    if (!valid) throw new BadRequestException('Invalid current password');

    const hashedPassword = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  }

  async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      phoneNumber?: string;
      parentPhoneNumber?: string;
      highSchoolSystem?: any;
      studyMode?: any;
      studyLanguage?: any;
      highSchoolGrade?: any;
      traditionalBranch?: any;
      baccalaureatePath?: any;
      universityId?: string;
      facultyId?: string;
      departmentId?: string;
      programId?: string;
      otherUniversityName?: string;
      otherFacultyName?: string;
      otherDepartmentName?: string;
      otherProgramName?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const normalize = (val: any) => val === '' ? null : val;
    
    // 2 & 3. Merge incoming PATCH data, respecting undefined = preserve, null = clear, empty string = null
    const finalState: any = {
      educationLevel: user.educationLevel,
      highSchoolSystem: data.highSchoolSystem !== undefined ? normalize(data.highSchoolSystem) : user.highSchoolSystem,
      studyMode: data.studyMode !== undefined ? normalize(data.studyMode) : user.studyMode,
      studyLanguage: data.studyLanguage !== undefined ? normalize(data.studyLanguage) : user.studyLanguage,
      highSchoolGrade: data.highSchoolGrade !== undefined ? normalize(data.highSchoolGrade) : user.highSchoolGrade,
      traditionalBranch: data.traditionalBranch !== undefined ? normalize(data.traditionalBranch) : user.traditionalBranch,
      baccalaureatePath: data.baccalaureatePath !== undefined ? normalize(data.baccalaureatePath) : user.baccalaureatePath,
      universityId: data.universityId !== undefined ? normalize(data.universityId) : user.universityId,
      facultyId: data.facultyId !== undefined ? normalize(data.facultyId) : user.facultyId,
      departmentId: data.departmentId !== undefined ? normalize(data.departmentId) : user.departmentId,
      programId: data.programId !== undefined ? normalize(data.programId) : user.programId,
      otherUniversityName: data.otherUniversityName !== undefined ? normalize(data.otherUniversityName) : user.otherUniversityName,
      otherFacultyName: data.otherFacultyName !== undefined ? normalize(data.otherFacultyName) : user.otherFacultyName,
      otherDepartmentName: data.otherDepartmentName !== undefined ? normalize(data.otherDepartmentName) : user.otherDepartmentName,
      otherProgramName: data.otherProgramName !== undefined ? normalize(data.otherProgramName) : user.otherProgramName,
    };

    // 3.5. Clear stale children if parent changed
    if (finalState.universityId !== user.universityId) {
      finalState.facultyId = null;
      finalState.departmentId = null;
      finalState.programId = null;
    } else if (finalState.facultyId !== user.facultyId) {
      finalState.departmentId = null;
      finalState.programId = null;
    } else if (finalState.departmentId !== user.departmentId) {
      finalState.programId = null;
    }

    // 4 & 5. Validate the complete intended state
    if (finalState.educationLevel === EducationLevel.UNIVERSITY) {
      await validateUniversitySegmentation(this.prisma, finalState);
    } else {
      validateStudentSegmentation(finalState);
    }

    // 6. Cleanup stale data logically based on validated state
    if (finalState.highSchoolSystem === HighSchoolSystem.TRADITIONAL) {
      finalState.baccalaureatePath = null;
      if (finalState.highSchoolGrade === HighSchoolGrade.GRADE_1) {
        finalState.traditionalBranch = null;
      }
    } else if (finalState.highSchoolSystem === HighSchoolSystem.BACCALAUREATE) {
      finalState.traditionalBranch = null;
      if (finalState.highSchoolGrade === HighSchoolGrade.GRADE_1) {
        finalState.baccalaureatePath = null;
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        parentPhoneNumber: data.parentPhoneNumber,
        highSchoolSystem: finalState.highSchoolSystem,
        studyMode: finalState.studyMode,
        studyLanguage: finalState.studyLanguage,
        highSchoolGrade: finalState.highSchoolGrade,
        traditionalBranch: finalState.traditionalBranch,
        baccalaureatePath: finalState.baccalaureatePath,
        universityId: finalState.universityId,
        facultyId: finalState.facultyId,
        departmentId: finalState.departmentId,
        programId: finalState.programId,
        otherUniversityName: finalState.otherUniversityName,
        otherFacultyName: finalState.otherFacultyName,
        otherDepartmentName: finalState.otherDepartmentName,
        otherProgramName: finalState.otherProgramName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        profilePictureUrl: true,
        role: true,
        isActive: true,
        educationLevel: true,
        phoneNumber: true,
        parentPhoneNumber: true,
        highSchoolSystem: true,
        studyMode: true,
        studyLanguage: true,
        highSchoolGrade: true,
        traditionalBranch: true,
        baccalaureatePath: true,
        universityId: true,
        facultyId: true,
        departmentId: true,
        programId: true,
        otherUniversityName: true,
        otherFacultyName: true,
        otherDepartmentName: true,
        otherProgramName: true,
      },
    });
  }
}
