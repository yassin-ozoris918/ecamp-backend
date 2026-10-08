/**
 * E2E test: View Limit System for Video Sessions
 *
 * Tests the full scenario:
 *   Admin → sets maxViews=3 on Lecture → Student watches sessions →
 *   view counts increment per session → Session A exhausted → Session B still open →
 *   Quiz/Exam unaffected → Time expiry blocks everything (existing behavior)
 *
 * The existing Lecture time-limit implementation is NOT modified.
 * We only verify that it still works correctly alongside the new view-limit system.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  Role,
  EducationLevel,
  HighSchoolSystem,
  StudyMode,
  StudyLanguage,
  HighSchoolGrade,
  TraditionalBranch,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';

jest.setTimeout(120000);

describe('View Limit System (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  let courseId: string;
  let lectureId: string;
  let sessionAId: string;
  let sessionBId: string;
  let quizId: string;

  const suffix = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    const jwt = app.get<JwtService>(JwtService);
    const password = await bcrypt.hash('password123', 10);

    // Create admin
    const admin = await prisma.user.create({
      data: { email: `admin-vl-${suffix}@test.com`, fullName: 'Admin VL', role: Role.ADMIN, password, isActive: true },
    });

    // Create student
    const student = await prisma.user.create({
      data: {
        email: `stu-vl-${suffix}@test.com`,
        fullName: 'Student VL',
        role: Role.STUDENT,
        password,
        isActive: true,
        educationLevel: EducationLevel.HIGH_SCHOOL,
        highSchoolSystem: HighSchoolSystem.TRADITIONAL,
        studyMode: StudyMode.ONLINE,
        studyLanguage: StudyLanguage.ARABIC,
        highSchoolGrade: HighSchoolGrade.GRADE_2,
        traditionalBranch: TraditionalBranch.SCIENCE,
        deviceId: 'test-device-id',
      },
    });
    studentId = student.id;

    adminToken = jwt.sign({ sub: admin.id, email: admin.email, role: Role.ADMIN, isImpersonating: false }, { secret: 'test_secret' });
    studentToken = jwt.sign({ sub: student.id, email: student.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });

    // Create course + lecture with maxViews=3
    const course = await prisma.course.create({
      data: {
        title: `VL Course ${suffix}`,
        status: 'PUBLISHED',
        audienceType: EducationLevel.HIGH_SCHOOL,
        targetHighSchoolSystem: HighSchoolSystem.TRADITIONAL,
        targetStudyMode: StudyMode.ONLINE,
        targetStudyLanguage: StudyLanguage.ARABIC,
        targetHighSchoolGrade: HighSchoolGrade.GRADE_2,
        targetTraditionalBranch: TraditionalBranch.SCIENCE,
      },
    });
    courseId = course.id;

    // Create lecture with maxViews=3 AND a time limit (3 days)
    const lecture = await prisma.lecture.create({
      data: {
        title: `VL Lecture ${suffix}`,
        courseId,
        isPublished: true,
        maxViews: 3,
        durationDays: 3,
        durationHours: 0,
        durationMinutes: 0,
      },
    });
    lectureId = lecture.id;

    // Create two video sessions
    const sessionA = await prisma.session.create({
      data: { lectureId, title: 'Session A', videoUrl: 'https://example.com/vid-a.mp4', isPublished: true },
    });
    sessionAId = sessionA.id;

    const sessionB = await prisma.session.create({
      data: { lectureId, title: 'Session B', videoUrl: 'https://example.com/vid-b.mp4', isPublished: true },
    });
    sessionBId = sessionB.id;

    // Create a quiz in the same lecture
    const quiz = await prisma.quiz.create({
      data: { lectureId, title: 'VL Quiz', maxAttempts: 3, passGrade: 0 },
    });
    quizId = quiz.id;

    // Grant student access (started, not expired)
    await prisma.studentLectureAccess.create({
      data: {
        studentId,
        lectureId,
        isStarted: true,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      },
    });
  });

  afterAll(async () => {
    await prisma.playbackSession.deleteMany({ where: { studentId } });
    await prisma.studentSessionViewUsage.deleteMany({ where: { studentId } });
    await app.close();
  });

  // --- Helper ---
  async function getStreamToken(sessionId: string): Promise<{ playbackSessionId: string }> {
    const res = await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionId}/stream-token`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id')
      .expect(200);
    return res.body;
  }

  async function consumeView(sessionId: string, playbackSessionId: string) {
    return request(app.getHttpServer())
      .post(`/lectures/sessions/${sessionId}/consume-view`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id')
      .send({ playbackSessionId });
  }

  async function getViewStatus(sessionId: string) {
    const res = await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionId}/view-status`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id');
    if (res.status !== 200) console.log('[DEBUG 403]', res.status, res.body);
    expect(res.status).toBe(200);
    return res.body as { usedViews: number; maxViews: number | null; isExhausted: boolean };
  }

  // ==================== Configuration tests ====================

  it('[Config] Lecture has maxViews=3', async () => {
    const lecture = await prisma.lecture.findUnique({ where: { id: lectureId } });
    expect(lecture!.maxViews).toBe(3);
  });

  it('[Config-5] maxViews=0 is rejected by API', async () => {
    await request(app.getHttpServer())
      .put(`/lectures/${lectureId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'VL Lecture', courseId, maxViews: 0 })
      .expect(400);
  });

  it('[Config-6] negative maxViews is rejected', async () => {
    await request(app.getHttpServer())
      .put(`/lectures/${lectureId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'VL Lecture', courseId, maxViews: -1 })
      .expect(400);
  });

  it('[Config-7] decimal maxViews is rejected', async () => {
    await request(app.getHttpServer())
      .put(`/lectures/${lectureId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'VL Lecture', courseId, maxViews: 2.5 })
      .expect(400);
  });

  // ==================== Initial state ====================

  it('[8] Opening lecture → usedViews=0 for all sessions', async () => {
    const statusA = await getViewStatus(sessionAId);
    const statusB = await getViewStatus(sessionBId);
    expect(statusA.usedViews).toBe(0);
    expect(statusB.usedViews).toBe(0);
    expect(statusA.maxViews).toBe(3);
    expect(statusA.isExhausted).toBe(false);
  });

  it('[9] Getting stream token does NOT consume a view', async () => {
    await getStreamToken(sessionAId);
    const status = await getViewStatus(sessionAId);
    expect(status.usedViews).toBe(0);
  });

  // ==================== Session A: 3 views ====================

  it('[11] First view of Session A → 1/3', async () => {
    const { playbackSessionId } = await getStreamToken(sessionAId);
    const res = await consumeView(sessionAId, playbackSessionId);
    expect(res.status).toBe(201);
    expect(res.body.usedViews).toBe(1);
    const status = await getViewStatus(sessionAId);
    expect(status.usedViews).toBe(1);
  });

  it('[12] Duplicate consume with same playbackSessionId → still 1/3 (idempotent)', async () => {
    // Get the playbackSessionId from the last consumed session
    const ps = await prisma.playbackSession.findFirst({
      where: { studentId, sessionId: sessionAId, consumed: true },
      orderBy: { createdAt: 'desc' },
    });
    const res = await consumeView(sessionAId, ps!.id);
    expect(res.status).toBe(201);
    const status = await getViewStatus(sessionAId);
    expect(status.usedViews).toBe(1); // still 1
  });

  it('[13] Second view of Session A → 2/3', async () => {
    const { playbackSessionId } = await getStreamToken(sessionAId);
    await consumeView(sessionAId, playbackSessionId);
    const status = await getViewStatus(sessionAId);
    expect(status.usedViews).toBe(2);
  });

  it('[14] Third view of Session A → 3/3', async () => {
    const { playbackSessionId } = await getStreamToken(sessionAId);
    await consumeView(sessionAId, playbackSessionId);
    const status = await getViewStatus(sessionAId);
    expect(status.usedViews).toBe(3);
    expect(status.isExhausted).toBe(true);
  });

  it('[15] Fourth view attempt on Session A → BLOCKED (403)', async () => {
    // stream-token endpoint itself should deny
    await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionAId}/stream-token`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id')
      .expect(403);
  });

  // ==================== Session B independence ====================

  it('[16] Session B is independent: still 0/3 after Session A exhausted', async () => {
    const status = await getViewStatus(sessionBId);
    expect(status.usedViews).toBe(0);
    expect(status.isExhausted).toBe(false);
  });

  it('[17] Session A exhausted does NOT block Session B', async () => {
    const res = await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionBId}/stream-token`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id')
      .expect(200);
    expect(res.body.playbackSessionId).toBeDefined();
  });

  it('[18] Session B view → 1/3', async () => {
    const { playbackSessionId } = await getStreamToken(sessionBId);
    await consumeView(sessionBId, playbackSessionId);
    const status = await getViewStatus(sessionBId);
    expect(status.usedViews).toBe(1);
  });

  // ==================== Quiz NOT affected ====================

  it('[19] Quiz in the same lecture is accessible (not view-limited)', async () => {
    // The quiz is returned in the playlist without isViewExhausted
    const res = await request(app.getHttpServer())
      .get(`/progress/playlist/${lectureId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    const quiz = res.body.playlist.find((i: any) => i.id === quizId);
    expect(quiz).toBeDefined();
    expect(quiz.isViewExhausted).toBeUndefined(); // quizzes have no view limit
    expect(quiz.maxViews).toBeUndefined();
  });

  // ==================== Playlist view data ====================

  it('Playlist includes correct view usage data for sessions', async () => {
    const res = await request(app.getHttpServer())
      .get(`/progress/playlist/${lectureId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    const sessionA = res.body.playlist.find((i: any) => i.id === sessionAId);
    const sessionB = res.body.playlist.find((i: any) => i.id === sessionBId);

    expect(sessionA.usedViews).toBe(3);
    expect(sessionA.maxViews).toBe(3);
    expect(sessionA.isViewExhausted).toBe(true);

    expect(sessionB.usedViews).toBe(1);
    expect(sessionB.maxViews).toBe(3);
    expect(sessionB.isViewExhausted).toBe(false);
  });

  // ==================== maxViews change behavior ====================

  it('[33] Increasing maxViews allows additional views without resetting usage', async () => {
    // Session A is at 3/3. Admin changes maxViews to 5.
    await prisma.lecture.update({ where: { id: lectureId }, data: { maxViews: 5 } });

    // Now Session A should be accessible again (3/5)
    const res = await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionAId}/stream-token`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id')
      .expect(200);
    expect(res.body.playbackSessionId).toBeDefined();

    const status = await getViewStatus(sessionAId);
    expect(status.usedViews).toBe(3); // Usage NOT reset
    expect(status.maxViews).toBe(5);
    expect(status.isExhausted).toBe(false);

    // Reset back to 3 for subsequent tests
    await prisma.lecture.update({ where: { id: lectureId }, data: { maxViews: 3 } });
  });

  it('[33] Decreasing maxViews below current usage → blocks immediately', async () => {
    // Session B has usedViews=1. Decrease maxViews to 1.
    await prisma.lecture.update({ where: { id: lectureId }, data: { maxViews: 1 } });

    await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionBId}/stream-token`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', 'test-device-id')
      .expect(403); // usedViews(1) >= maxViews(1)

    // Usage is NOT reset
    const status = await getViewStatus(sessionBId);
    expect(status.usedViews).toBe(1);

    // Restore
    await prisma.lecture.update({ where: { id: lectureId }, data: { maxViews: 3 } });
  });

  // ==================== Existing time-limit behavior (unchanged) ====================

  it('[22-26] Existing time-limit still blocks when expired (unchanged behavior)', async () => {
    // Create a separate student and access record that is expired
    const password2 = await bcrypt.hash('pw', 10);
    const jwt = app.get<JwtService>(JwtService);

    const student2 = await prisma.user.create({
      data: {
        email: `stu-vl-expired-${suffix}@test.com`,
        fullName: 'Expired Student',
        role: Role.STUDENT,
        password: password2,
        isActive: true,
        educationLevel: EducationLevel.HIGH_SCHOOL,
        highSchoolSystem: HighSchoolSystem.TRADITIONAL,
        studyMode: StudyMode.ONLINE,
        studyLanguage: StudyLanguage.ARABIC,
        highSchoolGrade: HighSchoolGrade.GRADE_2,
        traditionalBranch: TraditionalBranch.SCIENCE,
      },
    });

    const expiredToken = jwt.sign(
      { sub: student2.id, email: student2.email, role: Role.STUDENT, isImpersonating: false },
      { secret: 'test_secret' },
    );

    // Expired access (1 second ago)
    await prisma.studentLectureAccess.create({
      data: {
        studentId: student2.id,
        lectureId,
        isStarted: true,
        activatedAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() - 1000), // expired
      },
    });

    // Stream token should be denied by the EXISTING time-limit check
    await request(app.getHttpServer())
      .get(`/lectures/sessions/${sessionBId}/stream-token`)
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(403);
  });
});
