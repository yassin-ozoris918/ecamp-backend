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

describe('Historical Immutability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let instructorToken: string;
  let studentId: string;
  let courseId: string;
  let lectureId: string;
  let quizId: string;
  let questionId: string;
  let attemptId: string;

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

    const admin = await prisma.user.create({ data: { email: `admin-hist-${suffix}@test.com`, fullName: 'Admin', role: Role.ADMIN, password, isActive: true } });
    const student = await prisma.user.create({ data: { email: `stu-hist-${suffix}@test.com`, fullName: 'Student', role: Role.STUDENT, password, educationLevel: EducationLevel.HIGH_SCHOOL, highSchoolSystem: HighSchoolSystem.TRADITIONAL, studyMode: StudyMode.ONLINE, studyLanguage: StudyLanguage.ARABIC, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE, isActive: true } });
    const instructor = await prisma.user.create({ data: { email: `inst-hist-${suffix}@test.com`, fullName: 'Instructor', role: Role.INSTRUCTOR, password, isActive: true } });
    
    studentId = student.id;
    
    const jwt = app.get<JwtService>(JwtService);
    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: Role.ADMIN, isImpersonating: false }, { secret: 'test_secret' });
    studentToken = jwt.sign({ sub: student.id, email: student.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });
    instructorToken = jwt.sign({ sub: instructor.id, email: instructor.email, role: Role.INSTRUCTOR, isImpersonating: false }, { secret: 'test_secret' });

    // Create course, section, lecture
    const course = await prisma.course.create({ data: { title: 'E2E Hist Course', description: 'Desc', status: 'PUBLISHED', audienceType: EducationLevel.HIGH_SCHOOL, targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL, targetStudyMode: StudyMode.ONLINE, targetStudyLanguage: StudyLanguage.ARABIC, targetHighSchoolGrade: HighSchoolGrade.GRADE_2, targetTraditionalBranch: TraditionalBranch.SCIENCE } });
    courseId = course.id;
    await prisma.courseInstructor.create({ data: { courseId, instructorId: instructor.id } });
    const section = await prisma.chapter.create({ data: { title: 'S1', courseId, orderIndex: 0, isPublished: true } });
    const lecture = await prisma.lecture.create({ data: { title: 'L1', chapterId: section.id, courseId: course.id, orderIndex: 0, isPublished: true } });
    lectureId = lecture.id;

    const quiz = await prisma.quiz.create({ data: { title: 'Q1', lectureId, maxAttempts: 3, passGrade: 50 } });
    quizId = quiz.id;

    // Give student access
    await prisma.studentLectureAccess.create({ data: { studentId, lectureId, isStarted: true } });

    // Populate question
    const q = await prisma.quizQuestion.create({ data: { quizId, type: 'MCQ', text: 'Original Text', points: 10, correctOptionIndex: 0, options: ['A', 'B', 'C'], version: 'A' } });
    questionId = q.id;
  });

  it('PROVE HISTORICAL INCONSISTENCY OR MUTABILITY', async () => {
    // 1. Student takes quiz
    await request(app.getHttpServer()).post(`/quizzes/${quizId}/start`).set('Authorization', `Bearer ${studentToken}`).expect(201);
    
    // 2. Student submits attempt with option 0 (Correct)
    await request(app.getHttpServer())
      .post(`/quizzes/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answers: [{ questionId, selectedOptionIndex: 0 }] })
      .expect(201);
    
    // 3. Get attempt ID
    const attempt = await prisma.quizAttempt.findFirst({ where: { studentId, quizId }, include: { responses: true } });
    expect(attempt!.score).toBe(100);
    expect(attempt!.responses.length).toBe(1);
    
    // 4. Instructor syncs questions (modifies the quiz structure by syncing a new question replacing the old one)
    await request(app.getHttpServer())
      .put(`/admin/quizzes/${quizId}/questions/batch`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ questions: [{ text: 'New Text', options: ['X', 'Y', 'Z'], correctOptionIndex: 1, points: 10, type: 'MCQ' }] })
      .expect(400); // Because it is restricted by P2003 Catch Block
      
    // 5. Check if the historical response was deleted by Prisma Cascade
    const responsesAfterSync = await prisma.quizAttemptResponse.findMany({ where: { attemptId: attempt!.id } });
    
    expect(responsesAfterSync.length).toBe(1);
    expect(responsesAfterSync[0].selectedOptionIndex).toBe(0);
    expect(responsesAfterSync[0].questionId).toBe(questionId);

    // 6. Ensure original question is fully intact
    const originalQuestion = await prisma.quizQuestion.findUnique({ where: { id: questionId } });
    expect(originalQuestion!.text).toBe('Original Text');
  });

  afterAll(async () => {
    await app.close();
  });
});
