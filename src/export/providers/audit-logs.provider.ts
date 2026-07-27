import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataProvider } from '../interfaces/data-provider.interface';

@Injectable()
export class AuditLogsProvider implements DataProvider {
  entity = 'audit-logs';

  constructor(private prisma: PrismaService) {}

  async collect(filters: Record<string, any> | undefined) {
    const where: any = {};

    if (filters?.action) where.action = filters.action;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      headers: [
        { key: 'id', label: 'ID' },
        { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Entity' },
        { key: 'entityId', label: 'Entity ID' },
        { key: 'actorName', label: 'Actor' },
        { key: 'actorEmail', label: 'Actor Email' },
        { key: 'details', label: 'Details' },
        { key: 'createdAt', label: 'Created At' },
      ],
      data: logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        entity: log.entity || '',
        entityId: log.entityId || '',
        actorName: log.user?.fullName || '',
        actorEmail: log.user?.email || '',
        details: log.details || '',
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }
}
