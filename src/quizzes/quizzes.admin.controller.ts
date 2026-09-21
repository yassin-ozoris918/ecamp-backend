import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { QuizzesService } from './quizzes.service';
import { Controller, Post, Body, UseGuards, Delete, Param, Put, Req, Get, Patch, ForbiddenException, Query, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
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
        referenceAnswer: dto.referenceAnswer ?? null,
        matchOptions:
          dto.matchOptions && dto.matchOptions.length > 0
            ? (dto.matchOptions as any)
            : Prisma.JsonNull,
        correctOrder: dto.correctOrder || [],
      },
    });
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    return this.prisma.quizQuestion.delete({ where: { id } });
  }

  // ─── REVIEW ENDPOINTS ──────────────────────────────────────────────────────

  /**
   * GET /admin/quizzes/:quizId/attempts
   * Lightweight paginated list of submitted attempts for a quiz.
   * Accessible by INSTRUCTOR (own courses only) and ADMIN.
   */
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get(':quizId/attempts')
  async getQuizAttempts(
    @Param('quizId') quizId: string,
    @Req() req: RequestWithUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.quizzesService.getQuizAttempts(
      quizId,
      req.user.sub,
      req.user.role,
      {
        skip: skip ? parseInt(skip, 10) : 0,
        take: take ? parseInt(take, 10) : 25,
        status,
        search,
      },
    );
  }

  /**
   * GET /admin/quizzes/attempts/:attemptId/review
   * Full attempt review with correct answers (instructor-only data).
   * Accessible by INSTRUCTOR (own courses only) and ADMIN.
   * IMPORTANT: This route must be declared BEFORE the generic :id route
   * to avoid 'attempts' being matched as a quiz ID.
   */
  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('attempts/:attemptId/review')
  async getAttemptReview(
    @Param('attemptId') attemptId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.quizzesService.getAttemptReview(
      attemptId,
      req.user.sub,
      req.user.role,
    );
  }

  /**
   * GET /admin/quizzes/attempts/:attemptId/responses
   * (legacy raw endpoint — kept for backward compatibility)
   */
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
    // Validate input
    if (points < 0) throw new BadRequestException('Override score cannot be negative.');

    const response = await this.prisma.quizAttemptResponse.findUnique({
      where: { id: responseId },
      include: { attempt: { include: { quiz: true } }, question: { select: { points: true, type: true } } },
    });
    
    if (!response) throw new ForbiddenException('Response not found');

    // Only allow override for subjective question types
    const subjectiveTypes = ['ESSAY', 'SHORT_ANSWER'];
    if (!subjectiveTypes.includes(response.question.type)) {
      throw new BadRequestException('Override is only allowed for ESSAY and SHORT_ANSWER questions.');
    }

    // Validate ceiling: cannot exceed question max points
    const maxAllowed = response.questionPoints ?? response.question.points;
    if (points > maxAllowed) {
      throw new BadRequestException(`Override score cannot exceed maximum points (${maxAllowed}).`);
    }

    await this.quizzesService.verifyLectureOwnershipAdmin(response.attempt.quiz.lectureId, req.user.sub, req.user.role);

    // Preserve original AI score; store override separately
    await this.prisma.quizAttemptResponse.update({
      where: { id: responseId },
      data: { 
        instructorOverrideScore: points,
        earnedPoints: points,  // update effective earned points
        // aiScoreGuess is NOT touched
      },
    });

    // Recalculate total attempt score server-side
    await this.quizzesService.recalculateAttemptScore(response.attempt.id);

    // Return the updated review for the frontend to refresh
    return { message: 'Override applied successfully.', responseId, points };
  }
}
