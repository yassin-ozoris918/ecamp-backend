import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { QuizzesService } from './quizzes.service';
import { Controller, Post, Body, UseGuards, Delete, Param, Put, Req, Get, Patch, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizQuestionDto } from './dto/create-quiz-question.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

import { UpdateQuizDto } from './dto/update-quiz.dto';

@Controller('admin/quizzes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class QuizzesAdminController {
  constructor(private prisma: PrismaService, private quizzesService: QuizzesService) {}

  @Get(':id')
  async getAdminQuiz(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.quizzesService.getAdminQuiz(id, req.user.sub, req.user.role);
  }

  @Put(':id')
  async updateQuiz(@Param('id') id: string, @Body() dto: UpdateQuizDto, @Req() req: RequestWithUser) {
    return this.quizzesService.updateQuiz(id, dto, req.user.sub, req.user.role);
  }

  @Put(':id/questions/batch')
  async syncQuestions(@Param('id') id: string, @Body() body: { questions: any[] }, @Req() req: RequestWithUser) {
    return this.quizzesService.syncQuizQuestions(id, body.questions, req.user.sub, req.user.role);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('questions')
  async addManualQuestion(@Body() dto: CreateQuizQuestionDto) {
    return this.prisma.quizQuestion.create({
      data: {
        quizId: dto.quizId,
        text: dto.text,
        options: dto.options || [],
        correctOptionIndex: dto.correctOptionIndex ?? -1,
        points: dto.points,
        version: dto.version ?? 'A',
      },
    });
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    return this.prisma.quizQuestion.delete({ where: { id } });
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('attempts/:attemptId/responses')
  async getAttemptResponses(@Param('attemptId') attemptId: string, @Req() req: RequestWithUser) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: true,
        responses: {
          include: { question: true }
        }
      }
    });
    
    if (!attempt) throw new ForbiddenException('Attempt not found');
    await this.quizzesService.verifyLectureOwnershipAdmin(attempt.quiz.lectureId, req.user.sub, req.user.role);
    
    return attempt.responses;
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch('responses/:responseId/override')
  async overrideScore(
    @Param('responseId') responseId: string,
    @Body('points') points: number,
    @Req() req: RequestWithUser,
  ) {
    const response = await this.prisma.quizAttemptResponse.findUnique({
      where: { id: responseId },
      include: { attempt: { include: { quiz: true } } },
    });
    
    if (!response) throw new ForbiddenException('Response not found');
    await this.quizzesService.verifyLectureOwnershipAdmin(response.attempt.quiz.lectureId, req.user.sub, req.user.role);

    const updatedResponse = await this.prisma.quizAttemptResponse.update({
      where: { id: responseId },
      data: { 
        instructorOverrideScore: points,
        earnedPoints: Math.round(points)
      },
    });

    // Optionally re-evaluate the total score of the attempt
    await this.quizzesService.recalculateAttemptScore(response.attempt.id);

    return updatedResponse;
  }
}
