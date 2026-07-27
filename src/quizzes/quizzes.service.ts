import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { AddQuestionDto } from './dto/add-question.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { Role, AttemptStatus, Prisma } from '@prisma/client';
import { ProgressService } from '../progress/progress.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class QuizzesService {
  constructor(
    private prisma: PrismaService,
    private progressService: ProgressService,
    private eventEmitter: EventEmitter2,
  ) {}

  // --- Deep Ownership Check (Instructor -> Course -> Lecture) ---
  private async verifyLectureOwnership(
    lectureId: string,
    instructorId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;

    const lecture = await this.prisma.lecture.findUnique({
      where: { id: lectureId },
      select: { courseId: true },
    });

    if (!lecture) throw new NotFoundException('Lecture not found');

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: {
        courseId: lecture.courseId,
        instructorId,
        },
    });

    if (!mapping)
      throw new ForbiddenException(
        'You do not have permission to modify this lecture.',
      );
  }

  // --- INSTRUCTOR METHODS ---

  async createQuiz(dto: CreateQuizDto, instructorId: string, role: Role) {
    await this.verifyLectureOwnership(dto.lectureId, instructorId, role);
    return this.prisma.quiz.create({ data: dto });
  }

  async updateQuiz(id: string, dto: UpdateQuizDto, instructorId: string, role: Role) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { lecture: true },
    });
    if (!quiz || quiz.deletedAt) throw new NotFoundException('Quiz not found');

    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: {
          courseId: quiz.lecture.courseId,
          instructorId,
        },
      });
      if (!mapping) throw new ForbiddenException('You do not have permission to modify this quiz.');
    }

    return this.prisma.quiz.update({
      where: { id },
      data: dto,
    });
  }

  async deleteQuiz(id: string, instructorId: string, role: Role) {
    if (role !== Role.ADMIN) {
      const quiz = await this.prisma.quiz.findUnique({
        where: { id },
        include: { lecture: true }
      });
      if (!quiz) throw new NotFoundException('Quiz not found');
      if (quiz.deletedAt) throw new NotFoundException('Quiz not found');

      const mapping = await this.prisma.courseInstructor.findFirst({
        where: {
          courseId: quiz.lecture.courseId,
          instructorId,
          },
      });

      if (!mapping)
        throw new ForbiddenException('You do not have permission to modify this quiz.');
    } else {
      const quiz = await this.prisma.quiz.findUnique({ where: { id } });
      if (!quiz || quiz.deletedAt) throw new NotFoundException('Quiz not found');
    }
    return this.prisma.quiz.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }



  async getAdminQuiz(quizId: string, instructorId: string, role: Role) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, },
      include: {
        questions: {
          orderBy: { createdAt: 'asc' }
        },
        lecture: true
      }
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    if (role !== Role.ADMIN) {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: {
          courseId: quiz.lecture.courseId,
          instructorId,
          },
      });
      if (!mapping) throw new ForbiddenException('You do not have permission to view this quiz.');
    }
    return quiz;
  }

  async syncQuizQuestions(quizId: string, questions: any[], instructorId: string, role: Role) {
    if (role !== Role.ADMIN) {
      const quiz = await this.prisma.quiz.findFirst({
        where: { id: quizId, },
        include: { lecture: true }
      });
      if (!quiz) throw new NotFoundException('Quiz not found');
      
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: {
          courseId: quiz.lecture.courseId,
          instructorId,
          },
      });

      if (!mapping)
        throw new ForbiddenException('You do not have permission to modify this quiz.');
    }

    // Wrap in a transaction: delete existing, insert new
    return this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.deleteMany({
        where: { quizId }
      });

      if (questions && questions.length > 0) {
        await tx.quizQuestion.createMany({
          data: questions.map(q => ({
            quizId,
            text: q.text,
            options: q.options || [],
            correctOptionIndex: q.correctOptionIndex || 0,
            points: q.points || 1,
            type: q.type || 'MCQ'
          }))
        });
      }
      return { message: 'Quiz questions synced successfully' };
    });
  }

  async addQuestion(dto: AddQuestionDto, instructorId: string, role: Role) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: dto.quizId, },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    await this.verifyLectureOwnership(quiz.lectureId, instructorId, role);

    if (dto.correctOptionIndex < 0 || dto.correctOptionIndex >= dto.options.length) {
      throw new BadRequestException('correctOptionIndex is out of bounds.');
    }

    return this.prisma.quizQuestion.create({
      data: {
        quizId: dto.quizId,
        text: dto.text,
        type: dto.type,
        options: dto.options,
        correctOptionIndex: dto.correctOptionIndex,
        points: dto.points || 1,
      },
    });
  }

  async abandonQuiz(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    // Attempt to resume lecture access and clear the timer pause
    await this.resumeLectureAccess(studentId, quiz.lectureId, quiz.timeLimit);
    
    return { success: true };
  }

  // --- STUDENT METHODS ---

  async getQuizForStudent(quizId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, },
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            type: true,
            options: true,
            points: true,
            // DO NOT expose correctOptionIndex to the student payload
          },
        },
      },
    });

    if (!quiz) throw new NotFoundException('Quiz not found or not published');
    return quiz;
  }

  async startQuiz(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    // Check if unlocked via ProgressService
    await this.progressService.checkItemUnlocked(
      quiz.lectureId,
      studentId,
      quiz.id,
    );

    // Check maxAttempts - don't allow starting if exhausted
    const previousAttempts = await this.prisma.quizAttempt.count({
      where: { quizId, studentId },
    });

    if (previousAttempts >= quiz.maxAttempts) {
      throw new ForbiddenException(
        `You have reached the maximum number of attempts (${quiz.maxAttempts}).`,
      );
    }

    const now = new Date();
    
    return this.prisma.$transaction(async (tx) => {
      // 1. Pause the lecture timer
      await tx.studentLectureAccess.updateMany({
        where: { studentId, lectureId: quiz.lectureId },
        data: { timerPausedAt: now },
      });

      // 2. Create the attempt
      return tx.quizAttempt.create({
        data: {
          quizId,
          studentId,
          startedAt: now,
          score: 0,
          status: AttemptStatus.PENDING,
        },
      });
    });
  }

  async saveDraft(quizId: string, studentId: string, answers: { questionId: string; selectedOptionIndex: number }[]) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, status: AttemptStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      throw new BadRequestException('You must start the quiz before saving a draft.');
    }

    const answersRecord: Record<string, number> = {};
    for (const a of answers) {
      answersRecord[a.questionId] = a.selectedOptionIndex;
    }

    return this.prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { draftAnswers: answersRecord },
    });
  }

  async getCurrentAttempt(quizId: string, studentId: string) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, status: AttemptStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) return null;

    return attempt;
  }

  async submitQuiz(dto: SubmitQuizDto, studentId: string) {
    // Find the quizId from the first answer's question
    if (!dto.answers || dto.answers.length === 0) {
      throw new BadRequestException('No answers provided.');
    }

    const firstQuestion = await this.prisma.quizQuestion.findUnique({
      where: { id: dto.answers[0].questionId },
    });

    if (!firstQuestion) throw new NotFoundException('Question not found');
    const quizId = firstQuestion.quizId;

    // Find the pending attempt for this specific quiz
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, status: AttemptStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt)
      throw new BadRequestException('You must start the quiz first or it is already submitted.');

    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, },
      include: { questions: true },
    });

    if (!quiz) throw new NotFoundException('Quiz not found');

    const now = new Date();
    
    // Resume lecture access (clears timerPausedAt and extends expiresAt)
    await this.resumeLectureAccess(studentId, quiz.lectureId, quiz.timeLimit);

    let isCheating = false;

    if (quiz.timeLimit) {
      const minutesPassed =
        (now.getTime() - attempt.startedAt.getTime()) / 60000;
      const gracePeriod = 1;
      if (minutesPassed > quiz.timeLimit + gracePeriod) {
        isCheating = true;
      }
    }

    let totalPossiblePoints = 0;
    let earnedPoints = 0;

    if (!isCheating) {
      for (const question of quiz.questions) {
        totalPossiblePoints += question.points;
        const studentAnswer = dto.answers.find(a => a.questionId === question.id);
        
        if (studentAnswer && studentAnswer.selectedOptionIndex === question.correctOptionIndex) {
          earnedPoints += question.points;
        }
      }
    } else {
      totalPossiblePoints = quiz.questions.reduce((acc, curr) => acc + curr.points, 0);
    }

    const scorePercentage =
      totalPossiblePoints > 0
        ? Math.round((earnedPoints / totalPossiblePoints) * 100)
        : 0;

    const isPassed = !isCheating && scorePercentage >= quiz.passGrade;
    const finalStatus = isPassed ? AttemptStatus.PASSED : AttemptStatus.FAILED;

    const studentAnswers: Record<string, number> = {};
    for (const a of dto.answers) {
      studentAnswers[a.questionId] = a.selectedOptionIndex;
    }

    await this.prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        score: scorePercentage,
        status: finalStatus,
        submittedAt: now,
        draftAnswers: studentAnswers,
      },
    });

    if (isPassed) {
      this.eventEmitter.emit('quiz.passed', {
        studentId,
        quizId: quiz.id,
        score: scorePercentage,
      });
    }
    
    // Always emit evaluated event for Risk Analyzer
    this.eventEmitter.emit('attempt.evaluated', {
      studentId,
      type: 'QUIZ',
      id: quiz.id,
      score: scorePercentage,
      isPassed,
    });

    // Count total attempts for this quiz
    const attemptsCount = await this.prisma.quizAttempt.count({
      where: { quizId: quiz.id, studentId },
    });

    const correctAnswers: Record<string, number> = {};
    for (const q of quiz.questions) {
      if (q.correctOptionIndex !== null) {
        correctAnswers[q.id] = q.correctOptionIndex;
      }
    }

    // studentAnswers already computed above

    return {
      score: scorePercentage,
      status: finalStatus,
      passGrade: quiz.passGrade,
      maxAttempts: quiz.maxAttempts,
      attemptsCount,
      isExhausted: !isPassed && attemptsCount >= quiz.maxAttempts,
      message: isCheating
        ? 'Time limit exceeded. Quiz auto-graded to 0.'
        : isPassed
          ? 'Congratulations, you passed!'
          : 'You did not pass. Try again.',
      correctAnswers,
      studentAnswers,
    };
  }

  async surrenderQuiz(quizId: string, studentId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const attemptsCount = await this.prisma.quizAttempt.count({
      where: { quizId, studentId },
    });

    if (attemptsCount >= quiz.maxAttempts) {
      throw new BadRequestException('Quiz is already exhausted.');
    }

    const lastAttempt = await this.prisma.quizAttempt.findFirst({
      where: { quizId, studentId, status: { not: AttemptStatus.PENDING } },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastAttempt) {
      throw new BadRequestException('No completed attempts to surrender.');
    }

    const attemptsToCreate = quiz.maxAttempts - attemptsCount;
    
    const dummyAttempts = Array.from({ length: attemptsToCreate }).map(() => ({
      quizId,
      studentId,
      score: lastAttempt.score,
      status: AttemptStatus.FAILED,
      startedAt: lastAttempt.startedAt,
      submittedAt: lastAttempt.submittedAt,
      draftAnswers: lastAttempt.draftAnswers as any,
    }));

    await this.prisma.quizAttempt.createMany({
      data: dummyAttempts,
    });

    return { message: 'Quiz surrendered successfully.', isExhausted: true };
  }

  async getLastSubmittedAttempt(quizId: string, studentId: string) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, status: { not: AttemptStatus.PENDING } },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) return null;

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });

    const correctAnswers: Record<string, number> = {};
    if (quiz) {
      for (const q of quiz.questions) {
        if (q.correctOptionIndex !== null) {
          correctAnswers[q.id] = q.correctOptionIndex;
        }
      }
    }

    return {
      score: attempt.score,
      status: attempt.status,
      passGrade: quiz?.passGrade || 0,
      maxAttempts: quiz?.maxAttempts || 1,
      message: 'Reviewing past attempt.',
      correctAnswers,
      studentAnswers: attempt.draftAnswers || {},
    };
  }

  private async resumeLectureAccess(studentId: string, lectureId: string, quizTimeLimit?: number | null) {
    const access = await this.prisma.studentLectureAccess.findFirst({
      where: { studentId, lectureId, }
    });
    
    if (access && access.timerPausedAt && access.expiresAt) {
      const now = new Date().getTime();
      const timeSpentMs = now - access.timerPausedAt.getTime();
      
      // Anti-cheat limit: max time limit + 1 min buffer, or 2 hours if untimed
      const maxExtensionMs = quizTimeLimit ? (quizTimeLimit + 1) * 60 * 1000 : 2 * 60 * 60 * 1000;
      const actualExtensionMs = Math.max(0, Math.min(timeSpentMs, maxExtensionMs));
      
      const newExpiresAt = new Date(access.expiresAt.getTime() + actualExtensionMs);
      await this.prisma.studentLectureAccess.update({
        where: { id: access.id },
        data: { 
          expiresAt: newExpiresAt,
          timerPausedAt: null 
        }
      });
    } else if (access && access.timerPausedAt) {
      // Just clear it if expiresAt is null (infinite access course)
      await this.prisma.studentLectureAccess.update({
        where: { id: access.id },
        data: { timerPausedAt: null }
      });
    }
  }
}


