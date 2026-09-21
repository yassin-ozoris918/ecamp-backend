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

describe('Progression & Surrender (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  let courseId: string;
  let chapterId: string;
  let lecture1Id: string;
  let lecture2Id: string;
  let quizId: string;

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

    const admin = await prisma.user.create({ data: { email: `admin-prog-${suffix}@test.com`, fullName: 'Admin', role: Role.ADMIN, password, isActive: true } });
    const student = await prisma.user.create({ data: { email: `stu-prog-${suffix}@test.com`, fullName: 'Student', role: Role.STUDENT, password, educationLevel: EducationLevel.HIGH_SCHOOL, highSchoolSystem: HighSchoolSystem.TRADITIONAL, studyMode: StudyMode.ONLINE, studyLanguage: StudyLanguage.ARABIC, highSchoolGrade: HighSchoolGrade.GRADE_2, traditionalBranch: TraditionalBranch.SCIENCE, isActive: true } });
    
    studentId = student.id;
    
    const jwt = app.get<JwtService>(JwtService);
    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: Role.ADMIN, isImpersonating: false }, { secret: 'test_secret' });
    studentToken = jwt.sign({ sub: student.id, email: student.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });

    const course = await prisma.course.create({ data: { title: 'Progression Course', description: 'Desc', status: 'PUBLISHED', audienceType: EducationLevel.HIGH_SCHOOL, targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL, targetStudyMode: StudyMode.ONLINE, targetStudyLanguage: StudyLanguage.ARABIC, targetHighSchoolGrade: HighSchoolGrade.GRADE_2, targetTraditionalBranch: TraditionalBranch.SCIENCE } });
    courseId = course.id;
    const chapter = await prisma.chapter.create({ data: { title: 'Chapter 1', courseId, orderIndex: 0, isPublished: true } });
    chapterId = chapter.id;

    // Lecture 1 (has a quiz, then a session)
    const lecture1 = await prisma.lecture.create({ data: { title: 'L1', chapterId, courseId, orderIndex: 0, isPublished: true } });
    lecture1Id = lecture1.id;
    const quiz = await prisma.quiz.create({ data: { title: 'L1 Quiz', lectureId: lecture1Id, maxAttempts: 3, passGrade: 50, sortOrder: 0 } });
    quizId = quiz.id;

    const session = await prisma.session.create({ data: { title: 'L1 Session', lectureId: lecture1Id, sortOrder: 1 } });

    // Enroll student
    await prisma.studentCourseAccess.create({ data: { studentId, courseId } });

    // Populate question
    await prisma.quizQuestion.create({ data: { quizId, type: 'MCQ', text: 'Q1', points: 10, correctOptionIndex: 0, options: ['Correct', 'Wrong'] } });
    
    // Give student access to L1
    await prisma.studentLectureAccess.create({ data: { studentId, lectureId: lecture1Id, isStarted: true } });
  });

  describe('Strict Quiz Blocking Logic', () => {
    it('should block subsequent items initially because L1 Quiz is not passed', async () => {
      const res = await request(app.getHttpServer())
        .get(`/progress/playlist/${lecture1Id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      
      const quizItem = res.body.playlist.find((item: any) => item.type === 'QUIZ');
      const sessionItem = res.body.playlist.find((item: any) => item.type === 'SESSION');

      expect(quizItem.isLocked).toBe(false);
      expect(sessionItem.isLocked).toBe(true); // Locked because previous item (Quiz) is not completed
    });

    it('should fail attempt 1, remaining blocked', async () => {
      const resStart = await request(app.getHttpServer()).post(`/quizzes/${quizId}/start`).set('Authorization', `Bearer ${studentToken}`);
      console.log('Quiz Start Response:', resStart.body);
      expect(resStart.status).toBe(201);
      
      const q = await prisma.quizQuestion.findFirst({ where: { quizId } });
      if (!q) throw new Error('Question not found');
      await request(app.getHttpServer())
        .post(`/quizzes/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers: [{ questionId: q.id, selectedOptionIndex: 1 }] }) // Wrong
        .expect(201);

      // Still blocked
      const resPlaylist = await request(app.getHttpServer()).get(`/progress/playlist/${lecture1Id}`).set('Authorization', `Bearer ${studentToken}`).expect(200);
      const sessionItem = resPlaylist.body.playlist.find((item: any) => item.type === 'SESSION');
      expect(sessionItem.isLocked).toBe(true);
    });

    it('should surrender remaining attempts and permanently lock', async () => {
      await request(app.getHttpServer())
        .post(`/quizzes/${quizId}/surrender`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(201);

      const attemptsCount = await prisma.quizAttempt.count({ where: { studentId, quizId } });
      expect(attemptsCount).toBe(3); // Consumed all 3

      // Still blocked
      const resPlaylist = await request(app.getHttpServer()).get(`/progress/playlist/${lecture1Id}`).set('Authorization', `Bearer ${studentToken}`).expect(200);
      const sessionItem = resPlaylist.body.playlist.find((item: any) => item.type === 'SESSION');
      expect(sessionItem.isLocked).toBe(true);
    });

    it('should keep historical attempt points correct after quiz edits', async () => {
      // Admin edits the quiz question points to 100
      await prisma.quizQuestion.updateMany({
        where: { quizId },
        data: { points: 100 }
      });

      // Get last submitted attempt
      const res = await request(app.getHttpServer())
        .get(`/quizzes/${quizId}/attempts/last-submitted`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      
      // Historical total points should STILL be 10, not 100! 
      // Because we fetch from the responses
      expect(res.body.totalPoints).toBe(10);
      expect(res.body.earnedPoints).toBe(0);
    });

    it('should allow admin intervention to unblock (by setting status to PASSED manually)', async () => {
      const lastAttempt = await prisma.quizAttempt.findFirst({ where: { studentId, quizId }, orderBy: { createdAt: 'desc' } });
      if (!lastAttempt) throw new Error('Last attempt not found');
      await prisma.quizAttempt.update({
        where: { id: lastAttempt.id },
        data: { status: AttemptStatus.PASSED, score: 100 }
      });

      // Now session should be unlocked
      const resPlaylist = await request(app.getHttpServer()).get(`/progress/playlist/${lecture1Id}`).set('Authorization', `Bearer ${studentToken}`).expect(200);
      const sessionItem = resPlaylist.body.playlist.find((item: any) => item.type === 'SESSION');
      expect(sessionItem.isLocked).toBe(false);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
