import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CertificatesService {
  constructor(private prisma: PrismaService) {}

  async issueCertificate(
    courseId: string,
    studentEmail: string,
    instructorId: string,
    role: string,
  ) {
    // Verify instructor owns the course
    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: { courseId, instructorId, },
      });
      if (!mapping) throw new ForbiddenException('You do not own this course.');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');

    const student = await this.prisma.user.findUnique({
      where: { email: studentEmail },
    });
    if (!student)
      throw new NotFoundException('Student not found with this email.');

    const existing = await this.prisma.certificate.findFirst({
      where: {
        studentId: student.id,
        courseId,
        },
    });

    if (existing) {
      return existing; // Return existing if already issued
    }

    return this.prisma.certificate.create({
      data: {
        studentId: student.id,
        courseId,
        // In a real app, you might trigger a PDF generation job here and store the real URL
        pdfUrl: `https://example.com/certificates/${courseId}/${student.id}.pdf`,
      },
    });
  }

  async getCertificatesForCourse(courseId: string) {
    return this.prisma.certificate.findMany({
      where: { courseId, },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getMyCertificates(studentId: string) {
    return this.prisma.certificate.findMany({
      where: { studentId, },
      include: { course: true },
      orderBy: { issuedAt: 'desc' },
    });
  }
}

