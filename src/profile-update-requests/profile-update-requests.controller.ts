import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ProfileUpdateRequestsService } from './profile-update-requests.service';
import { CreateProfileUpdateRequestDto } from './dto/create-profile-update-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('profile-update-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfileUpdateRequestsController {
  constructor(private readonly profileUpdateRequestsService: ProfileUpdateRequestsService) {}

  @Post('me')
  @Roles(Role.STUDENT)
  create(@Req() req, @Body() createProfileUpdateRequestDto: CreateProfileUpdateRequestDto) {
    return this.profileUpdateRequestsService.create(req.user.sub, createProfileUpdateRequestDto);
  }

  @Get('me')
  @Roles(Role.STUDENT)
  getMyRequest(@Req() req) {
    return this.profileUpdateRequestsService.getMyRequest(req.user.sub);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.profileUpdateRequestsService.findAll();
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  approve(@Param('id') id: string, @Req() req) {
    return this.profileUpdateRequestsService.approve(id, req.user.sub);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN)
  reject(@Param('id') id: string, @Req() req, @Body('reason') reason?: string) {
    return this.profileUpdateRequestsService.reject(id, req.user.sub, reason);
  }
}
