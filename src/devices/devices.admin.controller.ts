import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { DevicesAdminService } from './devices-admin.service';
import { DeviceRequestsQueryDto, ReviewDeviceRequestDto } from './dto/devices.dto';

/** Admin: trusted devices, change requests, sign-in attempts and sharing risk. */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/devices')
export class DevicesAdminController {
  constructor(private readonly devices: DevicesAdminService) {}

  @Get('overview')
  overview() {
    return this.devices.overview();
  }

  @Get('requests')
  requests(@Query() q: DeviceRequestsQueryDto) {
    return this.devices.requests(q.status ?? 'PENDING');
  }

  @Post('requests/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDeviceRequestDto, @Req() req: RequestWithUser) {
    return this.devices.approve(id, req.user.sub, dto.note);
  }

  @Post('requests/:id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDeviceRequestDto, @Req() req: RequestWithUser) {
    return this.devices.reject(id, req.user.sub, dto.note);
  }

  @Get('attempts')
  attempts(@Query('search') search?: string, @Query('outcome') outcome?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.devices.attempts({ search, outcome, skip: skip ? parseInt(skip, 10) || 0 : 0, take: take ? parseInt(take, 10) || 50 : 50 });
  }

  @Get('suspicious')
  suspicious() {
    return this.devices.suspicious();
  }

  @Get('students/:id')
  student(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.studentDevices(id);
  }

  @Post('students/:id/reset')
  reset(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.devices.resetStudent(id, req.ip, req.headers['user-agent']);
  }

  @Post('browsers/:id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.revokeBrowser(id);
  }
}
