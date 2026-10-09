import { Controller, Get, Param, UseGuards, Req, Query } from '@nestjs/common';
import { InstructorDashboardService } from './instructor-dashboard.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('instructor/courses')
export class InstructorDashboardController {
  constructor(private readonly dashboardService: InstructorDashboardService) {}

  @Get()
  async getCourses(@Req() req: RequestWithUser) {
    return this.dashboardService.getInstructorCourses(req.user.sub);
  }

  @Get(':courseId')
  async getCourseOverview(@Req() req: RequestWithUser, @Param('courseId') courseId: string) {
    return this.dashboardService.getCourseOverview(req.user.sub, courseId);
  }

  @Get(':courseId/analytics')
  async getCourseAnalytics(@Req() req: RequestWithUser, @Param('courseId') courseId: string) {
    return this.dashboardService.getCourseAnalytics(req.user.sub, courseId);
  }

  @Get(':courseId/students')
  async getCourseStudents(
    @Req() req: RequestWithUser, 
    @Param('courseId') courseId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    return this.dashboardService.getCourseStudents(req.user.sub, courseId, parseInt(page, 10), parseInt(limit, 10));
  }

  @Get(':courseId/lectures')
  async getCourseLectures(@Req() req: RequestWithUser, @Param('courseId') courseId: string) {
    return this.dashboardService.getCourseLectures(req.user.sub, courseId);
  }

  @Get(':courseId/lectures/:lectureId/analytics')
  async getLectureAnalytics(
    @Req() req: RequestWithUser, 
    @Param('courseId') courseId: string,
    @Param('lectureId') lectureId: string
  ) {
    return this.dashboardService.getLectureAnalytics(req.user.sub, courseId, lectureId);
  }

  @Get(':courseId/lectures/:lectureId/students')
  async getLectureWatchers(
    @Req() req: RequestWithUser, 
    @Param('courseId') courseId: string,
    @Param('lectureId') lectureId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    return this.dashboardService.getLectureWatchers(req.user.sub, courseId, lectureId, parseInt(page, 10), parseInt(limit, 10));
  }

  @Get(':courseId/lectures/:lectureId/unwatched-students')
  async getLectureUnwatchedStudents(
    @Req() req: RequestWithUser, 
    @Param('courseId') courseId: string,
    @Param('lectureId') lectureId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    return this.dashboardService.getLectureUnwatchedStudents(req.user.sub, courseId, lectureId, parseInt(page, 10), parseInt(limit, 10));
  }
}

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('instructor/dashboard')
export class InstructorDashboardStatsController {
  constructor(private readonly dashboardService: InstructorDashboardService) {}

  @Get('stats')
  async getDashboardStats(@Req() req: RequestWithUser) {
    return this.dashboardService.getDashboardStats(req.user.sub);
  }
}
