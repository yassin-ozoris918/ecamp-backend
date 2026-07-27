import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get('logs')
  async getNotificationLogs(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 50;

    const [logs, total] = await Promise.all([
      this.prisma.parentNotificationLog.findMany({
        skip: parsedSkip,
        take: parsedTake,
        include: {
          student: { select: { fullName: true } }
        },
        orderBy: { dispatchedAt: 'desc' }
      }),
      this.prisma.parentNotificationLog.count()
    ]);

    return {
      data: logs,
      meta: {
        total,
        skip: parsedSkip,
        take: parsedTake
      }
    };
  }
}
