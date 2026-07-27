import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { InstructorDashboardService } from './instructor-dashboard.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('instructor-dashboard')
export class InstructorDashboardController {
  constructor(private readonly dashboardService: InstructorDashboardService) {}

  @Get('stats')
  async getStats(@Req() req: RequestWithUser) {
    return this.dashboardService.getInstructorStats(req.user.sub);
  }

  @Get('students')
  async getStudents(@Req() req: RequestWithUser) {
    return this.dashboardService.getInstructorStudents(req.user.sub);
  }

  @Get('exams/pending')
  async getPendingExams(@Req() req: RequestWithUser) {
    return this.dashboardService.getPendingExams(req.user.sub);
  }
}
