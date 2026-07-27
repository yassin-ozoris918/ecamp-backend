import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class ActivationCodesProvider implements DataProvider {
  entity = 'activation-codes';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = {};

    if (filters?.lectureId) where.lectureId = filters.lectureId;
    if (filters?.status) where.status = filters.status;
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const codes = await this.prisma.activationCode.findMany({
      where,
      include: { redeemedLecture: { select: { title: true } }, redeemedCourse: { select: { title: true } }, student: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'code', label: 'Code' },
        { key: 'lectureTitle', label: 'Lecture' },
        { key: 'status', label: 'Status' },
        { key: 'redeemedBy', label: 'Redeemed By' },
        { key: 'redeemedAt', label: 'Redeemed At' },
        { key: 'createdAt', label: 'Created At' },
      ],
      data: codes.map((c) => ({
        id: c.id,
        code: c.code,
        lectureTitle: c.targetType === 'COURSE' ? (c.redeemedCourse?.title || 'COURSE CODE') : (c.redeemedLecture?.title || 'LECTURE CODE'),
        status: c.status,
        redeemedBy: c.student?.fullName || '',
        redeemedAt: c.redeemedAt?.toISOString() || '',
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
