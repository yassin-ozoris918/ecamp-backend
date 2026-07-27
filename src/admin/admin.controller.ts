import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { ReportsService } from './reports.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { AiService } from '../ai/ai.service';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly reportsService: ReportsService,
    private readonly aiService: AiService,
  ) {}

  // --- USER MANAGEMENT ---

  @Get('users')
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.adminService.updateUser(id, data);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Post('users/:id/force-logout')
  @HttpCode(HttpStatus.OK)
  async forceLogout(@Param('id') id: string) {
    return this.adminService.forceLogout(id);
  }

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body('newPasswordHash') newPasswordHash: string,
  ) {
    return this.adminService.resetPassword(id, newPasswordHash);
  }

  @Post('users/:id/reset-device')
  @Put('users/:id/reset-device')
  async resetDeviceLock(@Param('id') id: string, @Req() req: RequestWithUser) {
    const browser = req.headers['user-agent'] || undefined;
    return this.adminService.resetDeviceLock(id, req.ip, browser);
  }

  @Get('users/:id/device-history')
  async getDeviceHistory(
    @Param('id') id: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 50;
    return this.adminService.getDeviceHistory(id, parsedSkip, parsedTake);
  }

  // --- PROGRESS MANAGEMENT ---

  @Post('users/:id/reset-quiz-attempts')
  async resetQuizAttempts(
    @Param('id') studentId: string,
    @Body('quizId') quizId: string,
  ) {
    return this.adminService.resetQuizAttempts(studentId, quizId);
  }

  @Post('users/:id/reset-exam-attempts')
  async resetExamAttempts(
    @Param('id') studentId: string,
    @Body('examId') examId: string,
  ) {
    return this.adminService.resetExamAttempts(studentId, examId);
  }

  @Post('users/:id/grant-lecture')
  async grantLectureAccess(
    @Param('id') studentId: string,
    @Body('lectureId') lectureId: string,
    @Body('validityDays') validityDays?: number,
  ) {
    return this.adminService.grantLectureAccess(studentId, lectureId, validityDays);
  }

  @Post('users/:id/grant-course')
  async grantCourseAccess(
    @Param('id') studentId: string,
    @Body('courseId') courseId: string,
    @Body('validityDays') validityDays?: number,
  ) {
    return this.adminService.grantCourseAccess(studentId, courseId, validityDays);
  }

  @Post('users/:id/remove-lecture')
  async removeLectureAccess(
    @Param('id') studentId: string,
    @Body('lectureId') lectureId: string,
  ) {
    return this.adminService.removeLectureAccess(studentId, lectureId);
  }

  @Post('users/:id/extend-lecture')
  async extendLectureExpiry(
    @Param('id') studentId: string,
    @Body('lectureId') lectureId: string,
    @Body('extraDays') extraDays: number,
  ) {
    return this.adminService.extendLectureExpiry(studentId, lectureId, extraDays);
  }

  // --- PROGRESS & PERFORMANCE ---

  @Get('catalog/search')
  async searchCatalog(@Query('q') query: string) {
    return this.adminService.searchCatalog(query);
  }

  @Get('users/:id/unlockable-items')
  async getUnlockableItems(@Param('id') studentId: string) {
    return this.adminService.getStudentUnlockableItems(studentId);
  }

  @Get('users/:id/progress')
  async getStudentProgress(@Param('id') studentId: string) {
    return this.adminService.getStudentProgress(studentId);
  }

  @Post('progress/override')
  async overrideProgress(
    @Body('studentId') studentId: string,
    @Body('itemType') itemType: 'SESSION' | 'QUIZ' | 'EXAM' | 'COURSE',
    @Body('itemId') itemId: string,
  ) {
    return this.adminService.overrideProgress(studentId, itemType, itemId);
  }

  // --- AUDIT ---

  @Get('audit-logs')
  async getAuditLogs(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 50;
    return this.adminService.getAuditLogs(parsedSkip, parsedTake);
  }

  @Get('system-audit-logs')
  async getSystemAuditLogs(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 50;
    return this.adminService.getSystemAuditLogs(parsedSkip, parsedTake);
  }

  // --- STATISTICS ---

  @Get('stats')
  async getStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('at-risk')
  async getAtRiskStudents(@Query('days') days?: string) {
    const daysNumber = days ? parseInt(days, 10) : 7;
    return this.adminService.getAtRiskStudents(daysNumber);
  }

  // --- REPORTS ---

  @Get('reports/students')
  async exportStudents(@Res() res: Response) {
    return this.reportsService.exportStudents(res);
  }

  @Get('reports/courses')
  async exportCourses(@Res() res: Response) {
    return this.reportsService.exportCourses(res);
  }

  // --- AI ---

  @Post('exams/:id/extract-questions')
  async extractQuestions(
    @Param('id') examId: string,
    @Body('fileUrl') fileUrl: string,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.aiService.extractQuestionsFromUrl(fileUrl, user.sub, examId);
  }
}
