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

    return this.prisma.profileUpdateRequest.create({
      data: {
        studentId,
        requestedFullName: dto.requestedFullName,
        requestedPhoneNumber: dto.requestedPhoneNumber,
        requestedParentPhone: dto.requestedParentPhone,
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
    const request = await this.prisma.profileUpdateRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is not pending');

    // Update user
    await this.prisma.user.update({
      where: { id: request.studentId },
      data: {
        fullName: request.requestedFullName || undefined,
        phoneNumber: request.requestedPhoneNumber || undefined,
        parentPhoneNumber: request.requestedParentPhone || undefined,
      },
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
