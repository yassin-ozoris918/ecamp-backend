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

import { AiService } from '../ai/ai.service';

@Injectable()
export class QuizzesService {
  constructor(
    private prisma: PrismaService,
    private progressService: ProgressService,
    private eventEmitter: EventEmitter2,
    private aiService: AiService,
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

    try {
      // Wrap in a transaction: delete existing, insert new
      return await this.prisma.$transaction(async (tx) => {
        await tx.quizQuestion.deleteMany({
          where: { quizId }
        });

        if (questions && questions.length > 0) {
          await tx.quizQuestion.createMany({
            data: questions.map((q: any) => ({
              quizId,
              text: q.text,
              options: q.options || [],
              correctOptionIndex: q.correctOptionIndex || 0,
              points: q.points || 1,
              type: q.type || 'MCQ',
              referenceAnswer: q.referenceAnswer || null,
              matchOptions:
                q.matchOptions && Array.isArray(q.matchOptions)
                  ? q.matchOptions
                  : Prisma.JsonNull,
              correctOrder: q.correctOrder || [],
              version: q.version || 'A',
            }))
          });
        }
        return { message: 'Quiz questions synced successfully' };
      });
    } catch (error: any) {
      if (error.code === 'P2003' || (error.message && error.message.includes('violates RESTRICT setting'))) {
        throw new BadRequestException('quiz.messages.cannotModifyUsed');
      }
      throw error;
    }
  }

    async addQuestion(dto: AddQuestionDto, instructorId: string, role: Role) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: dto.quizId },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    await this.verifyLectureOwnership(quiz.lectureId, instructorId, role);

    const type = dto.type || 'MCQ';
    const options = dto.options || [];
    const correctOptionIndex = dto.correctOptionIndex ?? -1;

    if ((type === 'MCQ' || type === 'TRUE_FALSE') && (correctOptionIndex < 0 || correctOptionIndex >= options.length)) {
      throw new BadRequestException('correctOptionIndex is out of bounds.');
    }

    return this.prisma.quizQuestion.create({
      data: {
        quizId: dto.quizId,
        text: dto.text,
        type: type,
        options: options,
        correctOptionIndex: correctOptionIndex,
        referenceAnswer: dto.referenceAnswer,
        matchOptions: dto.matchOptions ? (dto.matchOptions as any) : Prisma.JsonNull,
        correctOrder: dto.correctOrder || [],
        points: dto.points || 1,
        version: dto.version ?? 'A',
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

  async getQuizForStudent(quizId: string, studentId?: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!quiz) throw new NotFoundException('Quiz not found or not published');

    let questionVersion: 'A' | 'B' = 'A';

    if (studentId) {
      const lastCompletedAttempt = await this.prisma.quizAttempt.findFirst({
        where: {
          quizId,
          studentId,
          status: { not: 'PENDING' },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastCompletedAttempt && lastCompletedAttempt.status === 'FAILED') {
        const versionBCount = quiz.questions.filter((q: any) => q.version === 'B').length;
        if (versionBCount > 0) {
          questionVersion = 'B';
        }
      }
    }

    const questions = quiz.questions
      .filter((q: any) => q.version === questionVersion)
      .map((q: any) => {
         const out = { ...q } as any;
         delete out.correctOptionIndex;
         delete out.referenceAnswer;
         
         if (out.type === 'MATCHING' && Array.isArray(out.matchOptions)) {
            const rights = out.matchOptions.map((m: any) => m.right);
            rights.sort(() => Math.random() - 0.5);
            out.matchOptions = out.matchOptions.map((m: any, i: number) => ({ left: m.left, right: rights[i] }));
         }
         
         if (out.type === 'ORDERING' && Array.isArray(out.correctOrder)) {
            const items = [...out.correctOrder];
            items.sort(() => Math.random() - 0.5);
            out.correctOrder = items;
         }
         return out;
      });

    return {
      ...quiz,
      questions,
      activeVersion: questionVersion,
    };
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

  async saveDraft(quizId: string, studentId: string, answers: any[]) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, status: AttemptStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      throw new BadRequestException('You must start the quiz before saving a draft.');
    }

    const answersRecord: Record<string, any> = {};
    for (const a of answers) {
      answersRecord[a.questionId] = {
        selectedOptionIndex: a.selectedOptionIndex,
        textResponse: a.textResponse,
        matchAnswer: a.matchAnswer,
        orderAnswer: a.orderAnswer,
      };
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
    if (!dto.answers || dto.answers.length === 0) {
      throw new BadRequestException('No answers provided.');
    }

    const firstQuestion = await this.prisma.quizQuestion.findUnique({
      where: { id: dto.answers[0].questionId },
    });
    if (!firstQuestion) throw new NotFoundException('Question not found');
    const quizId = firstQuestion.quizId;

    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, status: AttemptStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    if (!attempt) throw new BadRequestException('You must start the quiz first or it is already submitted.');

    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId },
      include: { questions: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const now = new Date();
    await this.resumeLectureAccess(studentId, quiz.lectureId, quiz.timeLimit);


    let totalPossiblePoints = 0;
    let earnedObjectivePoints = 0;
    
    // Arrays for DB insertion and AI processing
    const responseRecords: any[] = [];
    const aiPromptData: any[] = [];
    
    const studentAnswersRecord: Record<string, any> = {};

    for (const question of quiz.questions) {
      if (question.type !== 'READ_ONLY_TEXT') {
        totalPossiblePoints += question.points;
      }
      
      const studentAnswer = dto.answers.find(a => a.questionId === question.id);
      
      let earnedPoints = 0;
      let textResponse = studentAnswer?.textResponse || null;
      let selectedOptionIndex = studentAnswer?.selectedOptionIndex ?? null;
      let matchAnswer = studentAnswer?.matchAnswer || null;
      let orderAnswer = studentAnswer?.orderAnswer || null;

      if (studentAnswer) {
        studentAnswersRecord[question.id] = {
           selectedOptionIndex, textResponse, matchAnswer, orderAnswer
        };

        if (question.type === 'MCQ' || question.type === 'TRUE_FALSE') {
          if (selectedOptionIndex === question.correctOptionIndex) {
            earnedPoints = question.points;
          }
        } else if (question.type === 'MATCHING' && matchAnswer && Array.isArray(matchAnswer) && Array.isArray(question.matchOptions)) {
          let correctPairs = 0;
          const matchOptionsArr = question.matchOptions as any[];
          const totalPairs = matchOptionsArr.length;
          
          if (totalPairs > 0) {
            const seenLefts = new Set<string>();
            for (const submittedPair of matchAnswer) {
               if (seenLefts.has(submittedPair.left)) continue;
               seenLefts.add(submittedPair.left);
               const isCorrect = matchOptionsArr.some(mo => mo.left === submittedPair.left && mo.right === submittedPair.right);
               if (isCorrect) correctPairs++;
            }
            correctPairs = Math.min(correctPairs, totalPairs);
            earnedPoints = parseFloat(((correctPairs / totalPairs) * question.points).toFixed(2));
          }
        } else if (question.type === 'ORDERING' && orderAnswer && Array.isArray(orderAnswer) && Array.isArray(question.correctOrder)) {
          let correctPositions = 0;
          const totalItems = question.correctOrder.length;
          
          if (totalItems > 0 && orderAnswer.length === totalItems) {
            for (let i = 0; i < totalItems; i++) {
              if (orderAnswer[i] === question.correctOrder[i]) {
                correctPositions++;
              }
            }
            earnedPoints = parseFloat(((correctPositions / totalItems) * question.points).toFixed(2));
          }
        } else if (question.type === 'SHORT_ANSWER' || question.type === 'ESSAY') {
          if (textResponse && textResponse.trim() !== '') {
            aiPromptData.push({
              responseId: question.id, // temporary ID until we save
              questionText: question.text,
              referenceAnswer: question.referenceAnswer || 'No specific rubric provided. Grade based on accuracy.',
              studentAnswer: textResponse,
              maxPoints: question.points
            });
          }
        }
      }
      
      if (question.type !== 'READ_ONLY_TEXT') {
        if (question.type === 'MCQ' || question.type === 'TRUE_FALSE' || question.type === 'MATCHING' || question.type === 'ORDERING') {
           earnedObjectivePoints += earnedPoints;
           
           responseRecords.push({
             attemptId: attempt.id,
             questionId: question.id,
             selectedOptionIndex,
             matchAnswer: matchAnswer ? JSON.stringify(matchAnswer) : null,
             orderAnswer: orderAnswer ? orderAnswer : [],
             textResponse: null,
             earnedPoints
           });
        } else {
           // For subjective, earnedPoints is initially null — AI will fill it in after grading
           const pointsToSave = null;
           responseRecords.push({
             attemptId: attempt.id,
             questionId: question.id,
             selectedOptionIndex: null,
             matchAnswer: null,
             orderAnswer: [],
             textResponse,
             earnedPoints: pointsToSave
           });
        }
      }
    }

    // Call AI for subjective grading
    let aiGrades: any[] = [];
    let hasAiFailure = false;
    
    if (aiPromptData.length > 0) {
       aiGrades = await this.aiService.evaluateQuizEssays(aiPromptData);
       if (aiGrades.length === 0) {
          hasAiFailure = true; // AI failed, responses remain pending with null score
       }
    }

    let earnedSubjectivePoints = 0;

    // We must map aiGrades back to responseRecords using questionId
    // because responseRecords aren't saved yet, so they don't have UUIDs.
    for (const record of responseRecords) {
       if (record.textResponse && record.earnedPoints === null) {
          if (hasAiFailure) {
             // Leave it null
          } else {
             const grade = aiGrades.find(g => g.responseId === record.questionId);
             if (grade) {
                record.earnedPoints = grade.aiScoreGuess;
                record.aiScoreGuess = grade.aiScoreGuess;
                record.aiConfidenceScore = grade.aiConfidenceScore;
                record.evaluationNote = grade.evaluationNote;
                earnedSubjectivePoints += grade.aiScoreGuess;
             } else {
                record.earnedPoints = 0; // Graded 0 if AI missed it
             }
          }
       }
    }

    // Save all responses
    for (const record of responseRecords) {
       // matchAnswer needs to be parsed back to Json if we stringified it, or passed as object. 
       // Prisma accepts JS objects for Json fields.
       let matchAnswerObj = null;
       if (record.matchAnswer) {
          try { matchAnswerObj = JSON.parse(record.matchAnswer); } catch(e) {}
       }
       
       await this.prisma.quizAttemptResponse.create({
         data: {
           attemptId: record.attemptId,
           questionId: record.questionId,
           selectedOptionIndex: record.selectedOptionIndex,
           textResponse: record.textResponse,
           matchAnswer: matchAnswerObj ? matchAnswerObj : Prisma.JsonNull,
           orderAnswer: record.orderAnswer,
           earnedPoints: record.earnedPoints,
           aiScoreGuess: record.aiScoreGuess,
           aiConfidenceScore: record.aiConfidenceScore,
           evaluationNote: record.evaluationNote,
         }
       });
    }

    // Check if the student submitted after the time limit (cheating/auto-submit)
    const isCheating = quiz.timeLimit != null
      ? now.getTime() > (attempt.startedAt.getTime() + quiz.timeLimit * 60 * 1000 + 30_000) // 30s grace period
      : false;

    // Final score calculation
    let finalEarnedPoints = earnedObjectivePoints + earnedSubjectivePoints;
    const scorePercentage = totalPossiblePoints > 0 ? Math.round((finalEarnedPoints / totalPossiblePoints) * 100) : 0;
    
    // If AI failed, do not mark as passed/failed permanently yet. We'll leave it pending or mark as pending_review if we had that state.
    // The requirement says: "If subjective grading is pending because of AI failure, do NOT falsely report a final score that implies the subjective questions were graded."
    // Let's mark status as PENDING if AI failed, but update the objective score.
    const finalStatus = hasAiFailure ? AttemptStatus.PENDING : (scorePercentage >= quiz.passGrade ? AttemptStatus.PASSED : AttemptStatus.FAILED);

    await this.prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        score: scorePercentage,
        status: finalStatus,
        submittedAt: now,
        draftAnswers: studentAnswersRecord,
      },
    });

    if (finalStatus === AttemptStatus.PASSED) {
      this.eventEmitter.emit('quiz.passed', {
        studentId,
        quizId: quiz.id,
        score: scorePercentage,
      });
    }
    
    if (finalStatus !== AttemptStatus.PENDING) {
      this.eventEmitter.emit('attempt.evaluated', {
        studentId,
        type: 'QUIZ',
        id: quiz.id,
        score: scorePercentage,
        isPassed: finalStatus === AttemptStatus.PASSED,
      });
    }

    const attemptsCount = await this.prisma.quizAttempt.count({
      where: { quizId: quiz.id, studentId },
    });

    const correctAnswers: Record<string, any> = {};
    for (const q of quiz.questions) {
      if (q.type === 'MCQ' || q.type === 'TRUE_FALSE') correctAnswers[q.id] = q.correctOptionIndex;
      else if (q.type === 'MATCHING') correctAnswers[q.id] = q.matchOptions;
      else if (q.type === 'ORDERING') correctAnswers[q.id] = q.correctOrder;
      // text responses don't have a strict client-side correct answer
    }

    return {
      score: scorePercentage,
      status: finalStatus,
      passGrade: quiz.passGrade,
      maxAttempts: quiz.maxAttempts,
      attemptsCount,
      isExhausted: finalStatus === AttemptStatus.FAILED && attemptsCount >= quiz.maxAttempts,
      message: isCheating
        ? 'quiz.messages.timeLimitExceeded'
        : hasAiFailure
          ? 'quiz.messages.aiFailed'
          : finalStatus === AttemptStatus.PASSED
            ? 'quiz.messages.passed'
            : 'quiz.messages.failed',
      studentAnswers: studentAnswersRecord,
      correctAnswers,
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
    let questionVersion: 'A' | 'B' = 'A';
    let questions: any[] = [];

    if (quiz) {
      for (const q of quiz.questions) {
        if (q.correctOptionIndex !== null) {
          correctAnswers[q.id] = q.correctOptionIndex;
        }
      }

      // --- Version selection (server-side) ---
      if (studentId) {
        const lastCompletedAttempt = await this.prisma.quizAttempt.findFirst({
          where: {
            quizId,
            studentId,
            status: { not: 'PENDING' },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (lastCompletedAttempt && lastCompletedAttempt.status === 'FAILED') {
          const versionBCount = quiz.questions.filter((q: any) => q.version === 'B').length;
          if (versionBCount > 0) {
            questionVersion = 'B';
          }
        }
      }

      // Filter to the determined version and strip correctOptionIndex from the student payload
      questions = quiz.questions
        .filter((q: any) => q.version === questionVersion)
        .map((q: any) => {
           const out = { ...q } as any;
           delete out.correctOptionIndex;
           delete out.referenceAnswer;
           
           if (out.type === 'MATCHING' && Array.isArray(out.matchOptions)) {
              const rights = out.matchOptions.map((m: any) => m.right);
              rights.sort(() => Math.random() - 0.5);
              out.matchOptions = out.matchOptions.map((m: any, i: number) => ({ left: m.left, right: rights[i] }));
           }
           
           if (out.type === 'ORDERING' && Array.isArray(out.correctOrder)) {
              const items = [...out.correctOrder];
              items.sort(() => Math.random() - 0.5);
              out.correctOrder = items;
           }
           return out;
        });
    }

    return {
      score: attempt.score,
      status: attempt.status,
      passGrade: quiz?.passGrade || 0,
      maxAttempts: quiz?.maxAttempts || 1,
      message: 'Reviewing past attempt.',
      studentAnswers: attempt.draftAnswers || {},
      correctAnswers,
      questions,
      activeVersion: questionVersion,
    };
  }

    async verifyLectureOwnershipAdmin(lectureId: string, instructorId: string, role: Role) {
    return this.verifyLectureOwnership(lectureId, instructorId, role);
  }

  async recalculateAttemptScore(attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: true } },
        responses: true,
      }
    });

    if (!attempt) return;

    let totalPossiblePoints = 0;
    let earnedPoints = 0;
    let allGraded = true;

    for (const question of attempt.quiz.questions) {
      if (question.type !== 'READ_ONLY_TEXT') {
        totalPossiblePoints += question.points;
      }
      
      const response = attempt.responses.find(r => r.questionId === question.id);
      if (response && response.earnedPoints !== null) {
         earnedPoints += response.earnedPoints;
      } else if (question.type !== 'READ_ONLY_TEXT') {
         allGraded = false;
      }
    }

    const scorePercentage = totalPossiblePoints > 0 ? Math.round((earnedPoints / totalPossiblePoints) * 100) : 0;
    
    let status = attempt.status;
    if (allGraded && status === AttemptStatus.PENDING) {
       status = scorePercentage >= attempt.quiz.passGrade ? AttemptStatus.PASSED : AttemptStatus.FAILED;
    }

    await this.prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { score: scorePercentage, status }
    });
    
    if (status === AttemptStatus.PASSED) {
       this.eventEmitter.emit('quiz.passed', {
         studentId: attempt.studentId,
         quizId: attempt.quiz.id,
         score: scorePercentage,
       });
       this.eventEmitter.emit('attempt.evaluated', {
         studentId: attempt.studentId,
         type: 'QUIZ',
         id: attempt.quiz.id,
         score: scorePercentage,
         isPassed: true,
       });
    } else if (status === AttemptStatus.FAILED) {
       this.eventEmitter.emit('attempt.evaluated', {
         studentId: attempt.studentId,
         type: 'QUIZ',
         id: attempt.quiz.id,
         score: scorePercentage,
         isPassed: false,
       });
    }
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


