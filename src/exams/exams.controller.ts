import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Put,
  Get,
  Delete,
  Patch,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { SubmitExamDto } from './dto/submit-exam.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { AddExamQuestionDto } from './dto/add-exam-question.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { AiService } from '../ai/ai.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('exams')
export class ExamsController {
  constructor(
    private readonly examsService: ExamsService,
    private readonly aiService: AiService,
  ) {}

  // --- INSTRUCTOR/ADMIN ENDPOINTS ---

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  createExam(
    @Body() body: CreateExamDto,
    @Req() req: RequestWithUser,
  ) {
    return this.examsService.createExam(body, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id')
  updateExam(
    @Param('id') id: string,
    @Body() body: UpdateExamDto,
    @Req() req: RequestWithUser,
  ) {
    return this.examsService.updateExam(id, body, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('admin/:id')
  async getAdminExam(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.examsService.getAdminExam(id, req.user.sub, req.user.role);
  }

  @Put(':id/questions/batch')
  async syncQuestions(@Param('id') id: string, @Body() body: { questions: any[] }, @Req() req: RequestWithUser) {
    return this.examsService.syncExamQuestions(id, body.questions, req.user.sub, req.user.role);
  }

  @Post(':id/questions')
  addQuestion(
    @Param('id') examId: string,
    @Body() body: AddExamQuestionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.examsService.addQuestion(examId, body, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('course/:courseId')
  getExamsForCourse(@Param('courseId') courseId: string) {
    return this.examsService.getExamsForCourse(courseId);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id/publish')
  publishExam(
    @Param('id') examId: string,
    @Body('isPublished') isPublished: boolean,
    @Req() req: RequestWithUser,
  ) {
    return this.examsService.publishExam(examId, isPublished, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete(':id')
  deleteExam(@Param('id') examId: string, @Req() req: RequestWithUser) {
    return this.examsService.deleteExam(examId, req.user.sub, req.user.role);
  }

  // --- STUDENT ENDPOINTS ---

  @Roles(Role.STUDENT)
  @Get(':id')
  getExam(@Param('id') id: string) {
    return this.examsService.getExamForStudent(id);
  }

  @Roles(Role.STUDENT)
  @Post(':id/start')
  startExam(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.examsService.startExam(id, user.sub);
  }

  @Roles(Role.STUDENT)
  @Post('submit')
  submitExam(@Body() dto: SubmitExamDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.examsService.submitExam(dto, user.sub);
  }

  // --- INSTRUCTOR GRADING ---

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put('attempts/:attemptId/grade')
  gradePendingEssays(
    @Param('attemptId') attemptId: string,
    @Body('grades') grades: { responseId: string; points: number }[],
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.examsService.gradePendingEssays(
      attemptId,
      grades,
      user.sub,
      user.role,
    );
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('attempts/:id/evaluate-subjective')
  evaluateSubjective(
    @Param('id') attemptId: string,
  ) {
    return this.aiService.evaluateSubjectiveAnswers(attemptId);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch('responses/:responseId/override')
  overrideScore(
    @Param('responseId') responseId: string,
    @Body('score') score: number,
    @Req() req: RequestWithUser,
  ) {
    return this.examsService.overrideResponseScore(responseId, score, req.user.sub, req.user.role);
  }
}
