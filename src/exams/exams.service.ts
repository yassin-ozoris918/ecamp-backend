import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitExamDto } from './dto/submit-exam.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { AddExamQuestionDto } from './dto/add-exam-question.dto';
import { QuestionType, Role, AttemptStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class ExamsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  private async verifyCourseOwnership(courseId: string, instructorId: string, role: string) {
    if (role === 'ADMIN') return;
    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId },
    });
    if (!mapping) throw new ForbiddenException('You do not own this course.');
  }

  // --- INSTRUCTOR METHODS: Create & Manage Exams ---

  async createExam(
    data: CreateExamDto,
    instructorId: string,
    role: string,
  ) {
    const courseId = data.courseId || undefined;
    const chapterId = data.chapterId || undefined;
    const lectureId = data.lectureId || undefined;

    if (!courseId && !chapterId && !lectureId) {
      throw new BadRequestException('An exam must be attached to a Course, Chapter, or Lecture.');
    }

    if (courseId) {
      await this.verifyCourseOwnership(courseId, instructorId, role);
    } else if (chapterId) {
      const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
      if (!chapter) throw new NotFoundException('Chapter not found');
      await this.verifyCourseOwnership(chapter.courseId, instructorId, role);
    }

    return this.prisma.exam.create({
      data: {
        title: data.title,
        description: data.description,
        courseId,
        chapterId,
        lectureId,
        timeLimit: data.timeLimit,
        maxAttempts: data.maxAttempts ?? 1,
        passGrade: data.passingScore ?? 50,
      },
    });
  }

  async updateExam(id: string, dto: UpdateExamDto, instructorId: string, role: string) {
    await this.verifyExamOwnership(id, instructorId, role);
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.prisma.exam.update({
      where: { id },
      data: dto,
    });
  }

  async getAdminExam(examId: string, instructorId: string, role: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, },
      include: {
        questions: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!exam) throw new NotFoundException('Exam not found');

    if (exam.courseId && role !== 'ADMIN') {
      const mapping = await this.prisma.courseInstructor.findFirst({
        where: { courseId: exam.courseId, instructorId, },
      });
      if (!mapping) throw new ForbiddenException('You do not own this course.');
    }
    return exam;
  }

  async syncExamQuestions(examId: string, questions: any[], instructorId: string, role: string) {
    await this.verifyExamOwnership(examId, instructorId, role);
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.examQuestion.deleteMany({
        where: { examId }
      });

      if (questions && questions.length > 0) {
        await tx.examQuestion.createMany({
          data: questions.map(q => {
            let options: string[] = [];
            let correctOptionIndex = 0;

            if (q.answers && q.answers.length > 0) {
              options = q.answers.map((a: any) => a.text);
              const correctIdx = q.answers.findIndex((a: any) => a.isCorrect);
              if (correctIdx !== -1) {
                correctOptionIndex = correctIdx;
              }
            } else if (q.options) {
              options = q.options;
              correctOptionIndex = q.correctOptionIndex || 0;
            }

            return {
              examId,
              text: q.text,
              type: (q.type || 'MCQ'),
              points: q.points || 1,
              options,
              correctOptionIndex,
            };
          })
        });
      }
      return { message: 'Exam questions synced successfully' };
    });
  }

  async addQuestion(
    examId: string,
    data: AddExamQuestionDto,
    instructorId: string,
    role: string,
  ) {
    await this.verifyExamOwnership(examId, instructorId, role);
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    let options: string[] = [];
    let correctOptionIndex = 0;

    if (data.answers && data.answers.length > 0) {
      options = data.answers.map(a => a.text);
      const correctIdx = data.answers.findIndex(a => a.isCorrect);
      if (correctIdx !== -1) {
        correctOptionIndex = correctIdx;
      }
    }

    return this.prisma.examQuestion.create({
      data: {
        examId,
        text: data.text,
        type: data.type as any,
        points: data.points ?? 1,
        options,
        correctOptionIndex,
      },
    });
  }

  async getExamsForCourse(courseId: string) {
    return this.prisma.exam.findMany({
      where: { courseId, },
      include: {
        questions: true,
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async publishExam(examId: string, isPublished: boolean, instructorId: string, role: string) {
    await this.verifyExamOwnership(examId, instructorId, role);
    return this.prisma.exam.update({
      where: { id: examId },
      data: { isPublished },
    });
  }

  async deleteExam(examId: string, instructorId: string, role: string) {
    await this.verifyExamOwnership(examId, instructorId, role);
    return this.prisma.exam.update({
      where: { id: examId },
      data: { deletedAt: new Date() },
    });
  }

  async getExamForStudent(examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, },
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            type: true,
            points: true,
            options: true,
            matchOptions: true,
            correctOrder: true,
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    if (!exam.isPublished)
      throw new ForbiddenException('Exam is not published');

    const shuffledQuestions = exam.questions.map((q: any) => {
      const out = { ...q };
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

    return { ...exam, questions: shuffledQuestions };
  }

  private async verifyExamOwnership(
    examId: string,
    instructorId: string,
    role: string,
  ) {
    if (role === 'ADMIN') return;

    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, },
      include: {
         chapter: { include: { course: true } },
         lecture: { include: { chapter: { include: { course: true } }, course: true } }
      }
    });

    if (!exam) throw new NotFoundException('Exam not found');

    let courseId = exam.courseId;
    if (!courseId && exam.lecture) {
       courseId = exam.lecture.courseId || exam.lecture.chapter?.courseId || null;
    }
    if (!courseId && exam.chapter) {
       courseId = exam.chapter.courseId;
    }

    if (!courseId)
      throw new ForbiddenException('Exam does not belong to a valid course.');

    const mapping = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, },
    });

    if (!mapping)
      throw new ForbiddenException(
        'You do not have permission to modify this exam.',
      );
  }

  async startExam(examId: string, studentId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, },
      include: {
        course: {
          include: {
            lectures: {
              where: { },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    // Eligibility: If this is a course-level exam, student must own all course lectures
    if (exam.courseId && exam.course) {
      const lectureIds = exam.course.lectures.map((l) => l.id);
      if (lectureIds.length > 0) {
        const ownedCount = await this.prisma.studentLectureAccess.count({
          where: {
            studentId,
            lectureId: { in: lectureIds },
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        });

        if (ownedCount < lectureIds.length) {
          throw new ForbiddenException(
            'You must own all lectures in this course before attempting the final exam.',
          );
        }
      }
    }

    // Check attempts limit
    const previousAttempts = await this.prisma.examAttempt.count({
      where: { examId, studentId },
    });

    if (previousAttempts >= exam.maxAttempts) {
      throw new ForbiddenException(
        `You have reached the maximum number of attempts (${exam.maxAttempts}).`,
      );
    }

    return this.prisma.examAttempt.create({
      data: {
        examId,
        studentId,
        startedAt: new Date(),
      },
    });
  }

  async submitExam(dto: SubmitExamDto, studentId: string) {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { examId: dto.examId, studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        exam: { include: { questions: true } },
      },
    });

    if (!attempt)
      throw new BadRequestException('You must start the exam first.');
    if (attempt.submittedAt)
      throw new ForbiddenException('Exam already submitted.');

    // 1. Enforce Timer (Same logic as Phase 6)
    const now = new Date();
    if (attempt.exam.timeLimit) {
      const minutesPassed =
        (now.getTime() - attempt.startedAt.getTime()) / 60000;
      if (minutesPassed > attempt.exam.timeLimit + 1) {
        // Auto-fail for extreme time manipulation (Cheating)
        await this.prisma.examAttempt.update({
          where: { id: attempt.id },
          data: { submittedAt: now, score: 0, status: AttemptStatus.FAILED },
        });
        throw new ForbiddenException(
          'Time limit massively exceeded. Exam auto-graded to 0.',
        );
      }
    }

    // 2. Hybrid Grading Setup
    let hasManualGradingPending = false;
    let autoGradedPoints = 0;
    const responsesToSave: any[] = [];

    // 3. Loop through responses and grade MCQs instantly
    for (const res of dto.responses) {
      const question = attempt.exam.questions.find(
        (q) => q.id === res.questionId,
      );
      if (!question) continue;

      let earnedPoints = 0;

      // Auto-Grade MCQs and True/False
      if (
        question.type === QuestionType.MCQ ||
        question.type === QuestionType.TRUE_FALSE
      ) {
        // Evaluate index based grading
        const isCorrect = res.selectedOptionIndex === question.correctOptionIndex;
        if (isCorrect) {
          earnedPoints = question.points;
          autoGradedPoints += question.points;
        }

        responsesToSave.push({
          questionId: question.id,
          selectedOptionIndex: res.selectedOptionIndex,
          earnedPoints: earnedPoints,
        });
      }
      // Flag Essays and Short Answers for Instructor Review
      else if (
        question.type === QuestionType.ESSAY ||
        question.type === QuestionType.SHORT_ANSWER
      ) {
        hasManualGradingPending = true;
        responsesToSave.push({
          questionId: question.id,
          textResponse: res.textResponse,
          earnedPoints: null, // Instructor will fill this in later
        });
      }
    }

    // 4. Save Responses and Update Attempt
    await this.prisma.$transaction(async (tx) => {
      // Create all the individual answer records
      await tx.studentExamResponse.createMany({
        data: responsesToSave.map(
          (r: {
            questionId: string;
            selectedOptionIndex?: number;
            textResponse?: string;
            earnedPoints: number | null;
          }) => ({
            attemptId: attempt.id,
            questionId: r.questionId,
            selectedOptionIndex: r.selectedOptionIndex,
            textResponse: r.textResponse || null,
            earnedPoints: r.earnedPoints,
          }),
        ),
      });

      // Update the main attempt record
      await tx.examAttempt.update({
        where: { id: attempt.id },
        data: {
          submittedAt: now,
          score: hasManualGradingPending
            ? null
            : this.calculatePercentage(
                autoGradedPoints,
                attempt.exam.questions,
              ),
          status: hasManualGradingPending
            ? AttemptStatus.PENDING
            : (this.checkIfPassed(autoGradedPoints, attempt.exam) ? AttemptStatus.PASSED : AttemptStatus.FAILED),
        },
      });
    });

    if (!hasManualGradingPending) {
      const score = this.calculatePercentage(autoGradedPoints, attempt.exam.questions);
      const isPassed = this.checkIfPassed(autoGradedPoints, attempt.exam);
      if (isPassed) {
        this.eventEmitter.emit('exam.passed', {
          studentId,
          examId: dto.examId,
          score: score,
        });
      }
      this.eventEmitter.emit('attempt.evaluated', {
        studentId,
        type: 'EXAM',
        id: dto.examId,
        score: score,
        isPassed,
      });
    }

    if (hasManualGradingPending) {
      this.eventEmitter.emit('exam.submitted', attempt.id);
    }

    const correctAnswers: Record<string, number> = {};
    for (const q of attempt.exam.questions) {
      if (q.correctOptionIndex !== null && q.correctOptionIndex !== undefined) {
        correctAnswers[q.id] = q.correctOptionIndex;
      }
    }

    const studentAnswers: Record<string, any> = {};
    for (const r of dto.responses) {
      studentAnswers[r.questionId] = {
        selectedOptionIndex: r.selectedOptionIndex,
        textResponse: r.textResponse
      };
    }

    return {
      message: hasManualGradingPending
        ? 'Exam submitted successfully! AI is currently grading your essay questions.'
        : 'Exam submitted and auto-graded successfully!',
      status: hasManualGradingPending ? AttemptStatus.PENDING : (this.checkIfPassed(autoGradedPoints, attempt.exam) ? AttemptStatus.PASSED : AttemptStatus.FAILED),
      correctAnswers,
      studentAnswers
    };
  }

  // --- EVENT LISTENERS ---
  @OnEvent('ai.grading.completed')
  async handleAiGradingCompleted(payload: {
    attemptId: string;
    grades: { responseId: string; points: number }[];
  }) {
    await this.gradePendingEssays(payload.attemptId, payload.grades);
  }

  // --- INSTRUCTOR METHODS ---

  async gradePendingEssays(
    attemptId: string,
    manualGrades: { responseId: string; points: number }[],
    instructorId?: string,
    role?: Role,
  ) {
    // 1. Fetch the attempt and its exam data
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        responses: true,
        exam: { include: { questions: true } },
      },
    });

    if (!attempt) throw new NotFoundException('Exam attempt not found.');
    if (attempt.status !== AttemptStatus.PENDING)
      throw new BadRequestException('This attempt is already fully graded.');

    if (instructorId && role) {
      await this.verifyExamOwnership(attempt.examId, instructorId, role);
    }

    // 2. Update the specific essay responses with the instructor's points
    await this.prisma.$transaction(
      manualGrades.map((grade) =>
        this.prisma.studentExamResponse.update({
          where: { id: grade.responseId },
          data: { earnedPoints: grade.points },
        }),
      ),
    );

    // 3. Recalculate the Final Score
    // We fetch the updated responses fresh from the database to ensure accuracy
    const updatedResponses = await this.prisma.studentExamResponse.findMany({
      where: { attemptId },
    });

    const totalEarnedPoints = updatedResponses.reduce(
      (acc, curr) => acc + (curr.earnedPoints || 0),
      0,
    );
    const scorePercentage = this.calculatePercentage(
      totalEarnedPoints,
      attempt.exam.questions,
    );
    const isPassed = scorePercentage >= attempt.exam.passGrade;

    // 4. Finalize the Attempt
    const finalizedAttempt = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        score: scorePercentage,
        status: isPassed ? AttemptStatus.PASSED : AttemptStatus.FAILED,
      },
    });

    if (isPassed) {
      this.eventEmitter.emit('exam.passed', {
        studentId: attempt.studentId,
        examId: attempt.examId,
        score: scorePercentage,
      });
    }
    this.eventEmitter.emit('attempt.evaluated', {
      studentId: attempt.studentId,
      type: 'EXAM',
      id: attempt.examId,
      score: scorePercentage,
      isPassed,
    });

    //Parent Notification Trigger
    // Fetch the student's details to check their education level
    const student = await this.prisma.user.findUnique({
      where: { id: attempt.studentId },
      select: { fullName: true, educationLevel: true, parentPhoneNumber: true },
    });

    // If they are a high school student, send the score to their parent
    if (
      student &&
      student.educationLevel === 'HIGH_SCHOOL' &&
      student.parentPhoneNumber
    ) {
      // We don't use 'await' here because we want this to run in the background.
      // We explicitly mark this as ignored with the `void` operator.
      void this.notificationsService.sendParentWhatsApp(
        student.parentPhoneNumber,
        student.fullName,
        attempt.exam.title,
        finalizedAttempt.score || 0,
      );
    }

    return {
      message: 'Essays graded and final score calculated successfully.',
      finalScore: finalizedAttempt.score,
      status: finalizedAttempt.status,
    };
  }


  async overrideResponseScore(responseId: string, score: number, instructorId: string, role: string) {
    const response = await this.prisma.studentExamResponse.findUnique({
      where: { id: responseId },
      include: { attempt: true },
    });
    if (!response) throw new NotFoundException('Response not found');

    await this.verifyExamOwnership(response.attempt.examId, instructorId, role);

    await this.prisma.studentExamResponse.update({
      where: { id: responseId },
      data: {
        instructorOverrideScore: score,
        earnedPoints: score, // Hard override the earned points
      },
    });

    // Recalculate full exam score
    const updatedResponses = await this.prisma.studentExamResponse.findMany({
      where: { attemptId: response.attemptId },
    });
    const exam = await this.prisma.exam.findUnique({
      where: { id: response.attempt.examId },
      include: { questions: true }
    });

    let totalEarned = 0;
    let isFullyGraded = true;
    for (const res of updatedResponses) {
       if (res.earnedPoints === null) {
          isFullyGraded = false;
       } else {
          totalEarned += res.earnedPoints;
       }
    }

    if (isFullyGraded && exam) {
      const scorePercentage = this.calculatePercentage(totalEarned, exam.questions);
      const isPassed = scorePercentage >= exam.passGrade;
      await this.prisma.examAttempt.update({
        where: { id: response.attemptId },
        data: {
          score: scorePercentage,
          status: isPassed ? AttemptStatus.PASSED : AttemptStatus.FAILED,
        }
      });
      this.eventEmitter.emit('attempt.evaluated', {
        studentId: response.attempt.studentId,
        type: 'EXAM',
        id: exam.id,
        score: scorePercentage,
        isPassed,
      });
    }

    return { message: 'Override applied successfully.' };
  }

  // --- Helper Methods ---
  private calculatePercentage(earned: number, questions: { points: number }[]) {
    const total = questions.reduce((acc, q) => acc + Number(q.points), 0);
    return total > 0 ? Math.round((earned / total) * 100) : 0;
  }

  private checkIfPassed(
    earned: number,
    exam: { passGrade: number; questions: { points: number }[] },
  ) {
    const score = this.calculatePercentage(earned, exam.questions);
    return score >= exam.passGrade;
  }
}

