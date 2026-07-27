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
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Students');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Full Name', key: 'fullName', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Level', key: 'educationLevel', width: 15 },
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

