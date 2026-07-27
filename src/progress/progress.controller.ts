import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProgressService } from './progress.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Roles(Role.STUDENT)
  @Get('dashboard')
  getDashboard(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.progressService.getStudentDashboard(user.sub);
  }

  // Get the unified, locked/unlocked playlist for a specific lecture
  @Roles(Role.STUDENT)
  @Get('playlist/:lectureId')
  getLecturePlaylist(
    @Param('lectureId') lectureId: string,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.progressService.getLecturePlaylist(lectureId, user.sub);
  }

  // Get the Syllabus of a course and the student's access status for its lectures
  @Roles(Role.STUDENT)
  @Get('course/:courseId/syllabus')
  getCourseSyllabus(
    @Param('courseId') courseId: string,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.progressService.getCourseSyllabus(courseId, user.sub);
  }

  // Triggered by the frontend when a video finishes playing
  @Roles(Role.STUDENT)
  @Post('session/:sessionId/complete')
  markSessionComplete(
    @Param('sessionId') sessionId: string,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.progressService.markSessionComplete(sessionId, user.sub);
  }



}
