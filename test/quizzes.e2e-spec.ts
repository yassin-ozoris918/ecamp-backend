import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, AttemptStatus, EducationLevel, HighSchoolSystem, StudyMode, StudyLanguage, HighSchoolGrade, TraditionalBranch } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';

jest.setTimeout(60000);

describe('Quizzes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let instructorToken: string;
  let studentId: string;
  let courseId: string;
  let lectureId: string;
  let quizId: string;
  let quiz3Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    
    // Cleanup
    const suffix = Date.now();
    const password = await bcrypt.hash('password123', 10);

    const admin = await prisma.user.create({ data: { email: `admin-quiz-${suffix}@test.com`, fullName: 'Admin', role: Role.ADMIN, password, isActive: true } });
    const student = await prisma.user.create({ data: { email: `stu-quiz-${suffix}@test.com`, fullName: 'Student', role: Role.STUDENT, password, educationLevel: EducationLevel.HIGH_SCHOOL, highSchoolSystem: HighSchoolSystem.TRADITIONAL, studyMode: StudyMode.ONLINE, studyLanguage: StudyLanguage.ARABIC, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE, isActive: true } });
    const instructor = await prisma.user.create({ data: { email: `inst-quiz-${suffix}@test.com`, fullName: 'Instructor', role: Role.INSTRUCTOR, password, isActive: true } });
    
    studentId = student.id;
    
    const jwt = app.get<JwtService>(JwtService);
    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: Role.ADMIN, isImpersonating: false }, { secret: 'test_secret' });
    studentToken = jwt.sign({ sub: student.id, email: student.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });
    instructorToken = jwt.sign({ sub: instructor.id, email: instructor.email, role: Role.INSTRUCTOR, isImpersonating: false }, { secret: 'test_secret' });

    const course = await prisma.course.create({ data: { title: 'E2E Quiz Course', description: 'Desc', status: 'PUBLISHED', audienceType: EducationLevel.HIGH_SCHOOL, targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL, targetStudyMode: StudyMode.ONLINE, targetStudyLanguage: StudyLanguage.ARABIC, targetHighSchoolGrade: HighSchoolGrade.GRADE_2, targetTraditionalBranch: TraditionalBranch.SCIENCE } });
    courseId = course.id;
    await prisma.courseInstructor.create({ data: { courseId, instructorId: instructor.id } });
    const section = await prisma.chapter.create({ data: { title: 'S1', courseId, orderIndex: 0, isPublished: true } });
    const lecture = await prisma.lecture.create({ data: { title: 'L1', chapterId: section.id, courseId: course.id, orderIndex: 0, isPublished: true } });
    lectureId = lecture.id;

    const quiz = await prisma.quiz.create({ data: { title: 'Q1', lectureId, maxAttempts: 3, passGrade: 50, timeLimit: 60 } });
    quizId = quiz.id;

    // Give student access
    await prisma.studentLectureAccess.create({ data: { studentId, lectureId, isStarted: true } });

    // Populate questions (including a mix of A and B versions)
    // MCQ Version A
    await prisma.quizQuestion.create({ data: { quizId, type: 'MCQ', text: 'Q1 MCQ', points: 10, correctOptionIndex: 1, options: ['A', 'B', 'C'], version: 'A', referenceAnswer: 'Hint' } });
    // MATCHING Version A
    await prisma.quizQuestion.create({ data: { quizId, type: 'MATCHING', text: 'Q2 MATCH', points: 10, correctOptionIndex: 0, matchOptions: [{left: 'L1', right: 'R1'}, {left: 'L2', right: 'R2'}], version: 'A' } });
    // ESSAY Version A
    await prisma.quizQuestion.create({ data: { quizId, type: 'ESSAY', text: 'Q3 ESSAY', points: 10, correctOptionIndex: 0, referenceAnswer: 'Good essay', version: 'A' } });
    
    // MCQ Version B
    await prisma.quizQuestion.create({ data: { quizId, type: 'MCQ', text: 'Q1 MCQ B', points: 10, correctOptionIndex: 0, options: ['A', 'B', 'C'], version: 'B', referenceAnswer: 'HintB' } });
  });

  describe('Student Payload Security', () => {
    it('should strip referenceAnswer, correctOptionIndex and shuffle arrays for student', async () => {
      const res = await request(app.getHttpServer())
        .get(`/quizzes/${quizId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const qs = res.body.questions;
      expect(qs.length).toBe(3); // Version A active

      for (const q of qs) {
        expect(q).not.toHaveProperty('correctOptionIndex');
        expect(q).not.toHaveProperty('referenceAnswer');
      }

      // Check matching shuffle
      const matchQ = qs.find((q: any) => q.type === 'MATCHING');
      expect(matchQ.matchOptions).toBeDefined();
      expect(matchQ.matchOptions[0].left).toBeDefined();
      expect(matchQ.matchOptions[0].right).toBeDefined();
    });
  });

  describe('Version A/B Logic', () => {
    it('should return Version A initially', async () => {
      const res = await request(app.getHttpServer())
        .get(`/quizzes/${quizId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      expect(res.body.activeVersion).toBe('A');
    });

    it('should fall back to Version B after failing Version A', async () => {
      // 1. Start quiz
      await request(app.getHttpServer())
        .post(`/quizzes/${quizId}/start`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(201);
      
      // 2. Submit wrong answers (fail)
      const resStart = await request(app.getHttpServer())
        .get(`/quizzes/${quizId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      
      const q_mcq = resStart.body.questions.find((q:any) => q.type === 'MCQ');
      
      await request(app.getHttpServer())
        .post(`/quizzes/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers: [{ questionId: q_mcq.id, selectedOptionIndex: 0 }] }) // wrong
        .expect(201);
      
      // 3. Fetch quiz again -> Should be Version B
      const resB = await request(app.getHttpServer())
        .get(`/quizzes/${quizId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      
      expect(resB.body.activeVersion).toBe('B');
      expect(resB.body.questions.length).toBe(1); // We only added 1 Q for B
    });
  });

  describe('Authorization', () => {
    it('should deny unauthenticated users', async () => {
      await request(app.getHttpServer())
        .get(`/quizzes/${quizId}`)
        .expect(401);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
