import { Test, TestingModule } from '@nestjs/testing';
import { QuizzesService } from './quizzes.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ProgressService } from '../progress/progress.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttemptStatus } from '@prisma/client';

describe('QuizzesService (Objective Grading)', () => {
  let service: QuizzesService;
  let prisma: PrismaService;
  let aiService: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizzesService,
        {
          provide: PrismaService,
          useValue: {
            quizAttempt: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
              create: jest.fn(),
            },
            quiz: {
              findFirst: jest.fn(),
            },
            lecture: {
              findUnique: jest.fn(),
            },
            quizQuestion: {
              findUnique: jest.fn(),
            },
            quizAttemptResponse: {
              create: jest.fn(),
            },
            studentLectureAccess: {
              findUnique: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
              update: jest.fn(),
            },
            courseInstructor: {
              findFirst: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: ProgressService,
          useValue: {
            // Mock methods if any are called
          },
        },
        {
          provide: AiService,
          useValue: {
            evaluateQuizEssays: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<QuizzesService>(QuizzesService);
    prisma = module.get<PrismaService>(PrismaService);
    aiService = module.get<AiService>(AiService);
  });

  describe('submitQuiz - Grading Logic', () => {
    it('should correctly grade MCQ and MATCHING without exceeding max points', async () => {
      // Mock Data
      const quizId = 'q1';
      const studentId = 's1';
      const attemptId = 'a1';
      const questions = [
        {
          id: 'q_mcq',
          quizId,
          type: 'MCQ',
          points: 10,
          correctOptionIndex: 1,
        },
        {
          id: 'q_matching',
          quizId,
          type: 'MATCHING',
          points: 20,
          matchOptions: [
            { left: 'A', right: '1' },
            { left: 'B', right: '2' }
          ],
        }
      ];

      (prisma.quizQuestion.findUnique as jest.Mock).mockResolvedValue(questions[0]);
      (prisma.quizAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: attemptId,
        startedAt: new Date(),
        status: AttemptStatus.PENDING,
      });
      (prisma.quiz.findFirst as jest.Mock).mockResolvedValue({
        id: quizId,
        passGrade: 50,
        timeLimit: null,
        lectureId: 'l1',
        questions,
      });
      (prisma.studentLectureAccess.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.studentLectureAccess.update as jest.Mock).mockResolvedValue(null);

      // Submit Duplicate Matching to test the vulnerability patch
      const result = await service.submitQuiz({
        answers: [
          { questionId: 'q_mcq', selectedOptionIndex: 1 }, // Correct = 10 pts
          { questionId: 'q_matching', matchAnswer: [
            { left: 'A', right: '1' },
            { left: 'A', right: '1' }, // Duplicate cheat
            { left: 'A', right: '1' },
          ] } // Correct = 1 out of 2 pairs = 10 pts
        ]
      }, studentId);

      // Ensure the submitted result includes correctAnswers keyed by question id
      expect(result.correctAnswers).toBeDefined();
      expect(result.correctAnswers.q_mcq).toBe(1);
      expect(result.correctAnswers.q_matching).toEqual(questions[1].matchOptions);

      // Ensure quizAttempt.update is called with correct score
      // Total Possible = 30
      // Earned = 10 (MCQ) + 10 (MATCHING) = 20
      // 20 / 30 = 67%
      expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            score: 67,
            status: AttemptStatus.PASSED,
          })
        })
      );
    });

    it('should set status to PENDING on AI failure', async () => {
      const quizId = 'q2';
      const studentId = 's1';
      const questions = [
        {
          id: 'q_essay',
          quizId,
          type: 'ESSAY',
          points: 50,
          referenceAnswer: 'Testing',
        }
      ];

      (prisma.quizQuestion.findUnique as jest.Mock).mockResolvedValue(questions[0]);
      (prisma.quizAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: 'a2',
        startedAt: new Date(),
        status: AttemptStatus.PENDING,
      });
      (prisma.quiz.findFirst as jest.Mock).mockResolvedValue({
        id: quizId,
        passGrade: 50,
        questions,
      });

      // Mock AI Failure (returns empty)
      (aiService.evaluateQuizEssays as jest.Mock).mockResolvedValue([]);

      await service.submitQuiz({
        answers: [{ questionId: 'q_essay', textResponse: 'Here is my essay.' }]
      }, studentId);

      // Should be PENDING
      expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AttemptStatus.PENDING,
          })
        })
      );
    });
  });

  describe('Adversarial MATCHING tests', () => {
    const quizId = 'q_adv_match';
    const studentId = 's_adv_match';
    const attemptId = 'a_adv_match';

    beforeEach(() => {
      const matchQ = {
        id: 'q_matching',
        quizId,
        type: 'MATCHING',
        points: 10,
        matchOptions: [
          { left: 'A', right: '1' },
          { left: 'B', right: '2' },
          { left: 'C', right: '3' }
        ],
      };
      (prisma.quizQuestion.findUnique as jest.Mock).mockResolvedValue(matchQ);
      (prisma.quizAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: attemptId,
        startedAt: new Date(),
        status: AttemptStatus.PENDING,
      });
      (prisma.quiz.findFirst as jest.Mock).mockResolvedValue({
        id: quizId, passGrade: 50, questions: [matchQ]
      });
      (prisma.quizAttempt.update as jest.Mock).mockClear();
    });

    test.each([
      ['A. all correct unique pairs', [{ left: 'A', right: '1' }, { left: 'B', right: '2' }, { left: 'C', right: '3' }], 100], // 10/10 = 100%
      ['B. one correct pair', [{ left: 'A', right: '1' }, { left: 'B', right: '9' }, { left: 'C', right: '9' }], 33],
      ['C. zero correct', [{ left: 'A', right: '9' }], 0],
      ['D. duplicate identical pair', [{ left: 'A', right: '1' }, { left: 'A', right: '1' }], 33],
      ['E. same LEFT mapped to multiple RIGHT values', [{ left: 'A', right: '1' }, { left: 'A', right: '2' }], 33],
      ['F. same RIGHT mapped to multiple LEFT values', [{ left: 'A', right: '1' }, { left: 'B', right: '1' }], 33],
      ['G. unknown LEFT', [{ left: 'Z', right: '1' }], 0],
      ['H. unknown RIGHT', [{ left: 'A', right: 'Z' }], 0],
      ['I. missing pair', [{ left: 'A', right: '1' }, { left: 'B', right: '2' }], 67],
      ['J. empty array', [], 0],
      ['K. null', null, 0],
      ['L. malformed object', [{ oops: 'A' }], 0],
      ['M. extra properties', [{ left: 'A', right: '1', extra: true }], 33],
      ['N. large payload', Array.from({length: 1000}).map(() => ({left: 'A', right: '1'})), 33],
    ])('MATCHING: %s', async (name, payload, expectedScore) => {
      await service.submitQuiz({
        answers: [{ questionId: 'q_matching', matchAnswer: payload as any }]
      }, studentId);
      
      expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            score: expectedScore,
          })
        })
      );
    });
  });

  describe('Adversarial ORDERING tests', () => {
    const quizId = 'q_adv_ord';
    const studentId = 's_adv_ord';
    const attemptId = 'a_adv_ord';

    beforeEach(() => {
      const ordQ = {
        id: 'q_ordering',
        quizId,
        type: 'ORDERING',
        points: 10,
        correctOrder: ['A', 'B', 'C']
      };
      (prisma.quizQuestion.findUnique as jest.Mock).mockResolvedValue(ordQ);
      (prisma.quizAttempt.findFirst as jest.Mock).mockResolvedValue({
        id: attemptId,
        startedAt: new Date(),
        status: AttemptStatus.PENDING,
      });
      (prisma.quiz.findFirst as jest.Mock).mockResolvedValue({
        id: quizId, passGrade: 50, questions: [ordQ]
      });
      (prisma.quizAttempt.update as jest.Mock).mockClear();
    });

    test.each([
      ['A. completely correct order', ['A', 'B', 'C'], 100],
      ['B. one correctly positioned item', ['A', 'C', 'B'], 33],
      ['C. partially correct order', ['A', 'B', 'Z'], 67],
      ['D. completely incorrect order', ['C', 'A', 'B'], 0],
      ['E. duplicate item', ['A', 'A', 'C'], 67],
      ['F. missing item', ['A', 'B'], 0],
      ['G. unknown item', ['A', 'B', 'Z'], 67],
      ['H. empty order', [], 0],
      ['I. null', null, 0],
      ['J. malformed payload', [{a: 1}], 0],
      ['K. extra items', ['A', 'B', 'C', 'D'], 0],
    ])('ORDERING: %s', async (name, payload, expectedScore) => {
      await service.submitQuiz({
        answers: [{ questionId: 'q_ordering', orderAnswer: payload as any }]
      }, studentId);
      
      let expected = expectedScore;
      
      expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            score: expected,
          })
        })
      );
    });
  });

  describe('syncQuizQuestions - Persistence', () => {
    let tx: any;

    beforeEach(() => {
      tx = {
        quizQuestion: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createMany: jest.fn().mockResolvedValue({ count: 3 }),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx));
    });

    it('should persist matchOptions, referenceAnswer, correctOrder and version', async () => {
      await service.syncQuizQuestions(
        'q_sync',
        [
          {
            text: 'M1',
            type: 'MATCHING',
            points: 5,
            matchOptions: [
              { left: 'L1', right: 'R1' },
              { left: 'L2', right: 'R2' },
            ],
            correctOrder: [],
            version: 'A',
          },
          {
            text: 'E1',
            type: 'ESSAY',
            points: 5,
            referenceAnswer: 'Good essay',
            correctOrder: [],
            version: 'B',
          },
          {
            text: 'O1',
            type: 'ORDERING',
            points: 5,
            correctOrder: ['X', 'Y', 'Z'],
            version: 'A',
          },
        ],
        'instructor1',
        'ADMIN',
      );

      const data = (tx.quizQuestion.createMany as jest.Mock).mock.calls[0][0].data;
      expect(data).toHaveLength(3);

      const matching = data.find((q: any) => q.type === 'MATCHING');
      expect(matching.matchOptions).toEqual([
        { left: 'L1', right: 'R1' },
        { left: 'L2', right: 'R2' },
      ]);
      expect(matching.version).toBe('A');

      const essay = data.find((q: any) => q.type === 'ESSAY');
      expect(essay.referenceAnswer).toBe('Good essay');
      expect(essay.version).toBe('B');

      const ordering = data.find((q: any) => q.type === 'ORDERING');
      expect(ordering.correctOrder).toEqual(['X', 'Y', 'Z']);
    });
  });

  describe('getAttemptReview (Instructor Review)', () => {
    it('should include correct answers for instructor and verify ownership', async () => {
      // Mock data
      const quizId = 'q1';
      const attemptId = 'a1';
      const lectureId = 'l1';
      
      const mockAttempt = {
        id: attemptId,
        quizId,
        studentId: 's1',
        score: 80,
        status: 'PASSED',
        quiz: { id: quizId, title: 'Test Quiz', passGrade: 50, lectureId, lecture: { id: lectureId, courseId: 'c1' } },
        student: { id: 's1', fullName: 'John Doe', email: 'john@example.com', profilePictureUrl: null },
        responses: [
          {
            id: 'r1',
            earnedPoints: 5,
            questionPoints: 5,
            selectedOptionIndex: 1,
            question: {
              id: 'q1',
              type: 'MCQ',
              text: 'What is 2+2?',
              points: 5,
              correctOptionIndex: 1,
              options: ['3', '4', '5'],
            }
          }
        ]
      };

      (prisma.quizAttempt.findUnique as jest.Mock).mockResolvedValue(mockAttempt);
      (prisma.quizAttempt.count as jest.Mock).mockResolvedValue(1);
      (prisma.lecture.findUnique as jest.Mock).mockResolvedValue({ courseId: 'c1' });
      (prisma.courseInstructor.findFirst as jest.Mock).mockResolvedValue({ id: 'ci1' }); // Mock ownership success

      const result = await service.getAttemptReview(attemptId, 'instructor1', 'INSTRUCTOR');

      expect(prisma.courseInstructor.findFirst).toHaveBeenCalled(); // verified ownership
      expect(result.attemptId).toBe(attemptId);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].correctAnswer.correctOptionIndex).toBe(1); // instructor sees correct answer
      expect(result.questions[0].correctAnswer.options).toEqual(['3', '4', '5']);
      expect(result.questions[0].studentAnswer.selectedOptionIndex).toBe(1);
    });
  });
});
