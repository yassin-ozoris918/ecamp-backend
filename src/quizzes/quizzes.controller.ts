import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Put,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { AddQuestionDto } from './dto/add-question.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { AuthGuard } from '@nestjs/passport';
import { Delete } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // --- INSTRUCTOR/ADMIN ENDPOINTS ---

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  createQuiz(@Body() dto: CreateQuizDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.createQuiz(dto, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Put(':id')
  updateQuiz(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuizDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.quizzesService.updateQuiz(id, dto, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete(':id')
  deleteQuiz(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.deleteQuiz(id, user.sub, user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('questions')
  addQuestion(@Body() dto: AddQuestionDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.addQuestion(dto, user.sub, user.role);
  }

  // --- STUDENT ENDPOINTS ---

  @Get(':id')
  getQuizForStudent(@Param('id') id: string, @Req() req: RequestWithUser) {
    const studentId = req.user?.sub;
    return this.quizzesService.getQuizForStudent(id, studentId);
  }

  @Post(':id/start')
  startQuiz(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.startQuiz(id, user.sub);
  }

  @Post(':id/abandon')
  abandonQuiz(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.abandonQuiz(id, user.sub);
  }

  @Put(':id/draft')
  saveDraft(
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user;
    return this.quizzesService.saveDraft(id, user.sub, dto.answers);
  }

  @Get(':id/attempts/current')
  getCurrentAttempt(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.getCurrentAttempt(id, user.sub);
  }

  @Post('submit')
  submitQuiz(@Body() dto: SubmitQuizDto, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.submitQuiz(dto, user.sub);
  }

  @Get(':id/attempts/last-submitted')
  getLastSubmittedAttempt(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.getLastSubmittedAttempt(id, user.sub);
  }

  @Post(':id/surrender')
  surrenderQuiz(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user;
    return this.quizzesService.surrenderQuiz(id, user.sub);
  }
}
