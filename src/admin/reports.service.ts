import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async exportStudents(res: Response) {
    const students = await this.prisma.user.findMany({
      where: { role: 'STUDENT', },
      select: {
        id: true,
        fullName: true,
        email: true,
        educationLevel: true,
        phoneNumber: true,
        createdAt: true,
        isActive: true,
        xp: true,
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
        academicUniversity: { select: { nameAr: true } },
        academicFaculty: { select: { nameAr: true } },
        academicDepartment: { select: { nameAr: true } },
        academicProgram: { select: { nameAr: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Students');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Full Name', key: 'fullName', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Level', key: 'educationLevel', width: 15 },
      { header: 'System', key: 'highSchoolSystem', width: 15 },
      { header: 'Mode', key: 'studyMode', width: 15 },
      { header: 'Language', key: 'studyLanguage', width: 15 },
      { header: 'Grade', key: 'highSchoolGrade', width: 15 },
      { header: 'Branch', key: 'traditionalBranch', width: 15 },
      { header: 'Path', key: 'baccalaureatePath', width: 15 },
      { header: 'University', key: 'university', width: 20 },
      { header: 'Faculty', key: 'faculty', width: 20 },
      { header: 'Phone', key: 'phoneNumber', width: 20 },
      { header: 'Status', key: 'isActive', width: 10 },
      { header: 'XP', key: 'xp', width: 10 },
      { header: 'Joined At', key: 'createdAt', width: 20 },
    ];

    students.forEach((student) => {
      worksheet.addRow({
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        educationLevel: student.educationLevel,
        highSchoolSystem: student.highSchoolSystem,
        studyMode: student.studyMode,
        studyLanguage: student.studyLanguage,
        highSchoolGrade: student.highSchoolGrade,
        traditionalBranch: student.traditionalBranch,
        baccalaureatePath: student.baccalaureatePath,
        university: student.academicUniversity?.nameAr || student.otherUniversityName || '',
        faculty: student.academicFaculty?.nameAr || student.otherFacultyName || '',
        phoneNumber: student.phoneNumber,
        isActive: student.isActive ? 'Active' : 'Suspended',
        xp: student.xp,
        createdAt: student.createdAt.toLocaleDateString(),
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'students_report.xlsx',
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  async exportCourses(res: Response) {
    const courses = await this.prisma.course.findMany({
      where: { },
      include: {
        _count: {
          select: { lectures: true, exams: true },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Courses');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Audience', key: 'audienceType', width: 15 },
      { header: 'Target System', key: 'targetHighSchoolSystem', width: 15 },
      { header: 'Target Mode', key: 'targetStudyMode', width: 15 },
      { header: 'Target Language', key: 'targetStudyLanguage', width: 15 },
      { header: 'Target Grade', key: 'targetHighSchoolGrade', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Lectures', key: 'lecturesCount', width: 10 },
      { header: 'Exams', key: 'examsCount', width: 10 },
      { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    courses.forEach((course) => {
      worksheet.addRow({
        id: course.id,
        title: course.title,
        audienceType: course.audienceType,
        targetHighSchoolSystem: course.targetHighSchoolSystem,
        targetStudyMode: course.targetStudyMode,
        targetStudyLanguage: course.targetStudyLanguage,
        targetHighSchoolGrade: course.targetHighSchoolGrade,
        status: course.status,
        lecturesCount: course._count.lectures,
        examsCount: course._count.exams,
        createdAt: course.createdAt.toLocaleDateString(),
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'courses_report.xlsx',
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}

