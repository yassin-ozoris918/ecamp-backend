import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { StudentNotificationsService } from './student-notifications.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.STUDENT)
@Controller('notifications')
export class StudentNotificationsController {
  constructor(private readonly notifications: StudentNotificationsService) {}

  /** Cheap endpoint polled by the bell badge. */
  @Get('unread-count')
  async unreadCount(@Req() req: RequestWithUser) {
    return { count: await this.notifications.unreadCount(req.user.sub) };
  }

  @Get()
  list(@Req() req: RequestWithUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.notifications.list(req.user.sub, { cursor: cursor || undefined, limit: limit ? Number(limit) : undefined });
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@Req() req: RequestWithUser) {
    return this.notifications.markAllRead(req.user.sub);
  }

  @Patch(':id/read')
  markRead(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(req.user.sub, id);
  }
}
