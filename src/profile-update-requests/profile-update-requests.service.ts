import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileUpdateRequestDto } from './dto/create-profile-update-request.dto';
import { RequestStatus } from '@prisma/client';

@Injectable()
export class ProfileUpdateRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(studentId: string, dto: CreateProfileUpdateRequestDto) {
    if (!dto.requestedFullName && !dto.requestedParentPhone && !dto.requestedPhoneNumber) {
      throw new BadRequestException('Must provide at least one field to update');
    }

    // Check if there's already a pending request
    const existing = await this.prisma.profileUpdateRequest.findFirst({
      where: { studentId, status: 'PENDING' },
    });

    if (existing) {
      throw new BadRequestException('You already have a pending profile update request.');
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { educationLevel: true },
    });

    let requestedParentPhone = dto.requestedParentPhone;
    if (student?.educationLevel === 'UNIVERSITY') {
      requestedParentPhone = null; // or undefined
    }

    // We should double check if after omitting parent phone, the request is still valid (not empty)
    if (!dto.requestedFullName && !requestedParentPhone && !dto.requestedPhoneNumber) {
      throw new BadRequestException('No valid fields to update for your education level');
    }

    return this.prisma.profileUpdateRequest.create({
      data: {
        studentId,
        requestedFullName: dto.requestedFullName,
        requestedPhoneNumber: dto.requestedPhoneNumber,
        requestedParentPhone: requestedParentPhone,
      },
    });
  }

  async findAll() {
    return this.prisma.profileUpdateRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: { fullName: true, email: true, phoneNumber: true, parentPhoneNumber: true },
        },
      },
    });
  }

  async getMyRequest(studentId: string) {
    return this.prisma.profileUpdateRequest.findFirst({
      where: { studentId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, adminId: string) {
    const request = await this.prisma.profileUpdateRequest.findUnique({ 
      where: { id },
      include: { student: { select: { educationLevel: true } } }
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is not pending');

    const updateData: any = {
      fullName: request.requestedFullName || undefined,
      phoneNumber: request.requestedPhoneNumber || undefined,
    };

    if (request.student.educationLevel === 'HIGH_SCHOOL') {
      updateData.parentPhoneNumber = request.requestedParentPhone || undefined;
    }

    // Update user
    await this.prisma.user.update({
      where: { id: request.studentId },
      data: updateData,
    });

    // Mark request as approved
    return this.prisma.profileUpdateRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
  }

  async reject(id: string, adminId: string, reason?: string) {
    const request = await this.prisma.profileUpdateRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is not pending');

    return this.prisma.profileUpdateRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }
}
