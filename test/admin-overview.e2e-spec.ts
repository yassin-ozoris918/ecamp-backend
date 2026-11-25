/**
 * E2E: admin "needs attention" counters and the exam grading queue (scoped per instructor).
 * Needs a disposable Postgres in DATABASE_URL.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(120000);

describe('Admin overview + grading queue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const tag = `adm-${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const mk = async (key: string, role: Role, extra: any = {}) => {
      const u = await prisma.user.create({ data: { fullName: key, email: `${key}-${tag}@t.test`, password: 'x', role, ...extra } });
      ids[key] = u.id;
      tokens[key] = jwt.sign({ sub: u.id, email: u.email, role }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });
    };
    await mk('admin', Role.ADMIN);
    await mk('teacherA', Role.INSTRUCTOR);
    await mk('teacherB', Role.INSTRUCTOR);
    await mk('student', Role.STUDENT);
    await mk('pending', Role.STUDENT, { isActive: false });

    ids.courseA = (await prisma.course.create({ data: { title: `A ${tag}` } })).id;
    ids.courseB = (await prisma.course.create({ data: { title: `B ${tag}` } })).id;
    await prisma.courseInstructor.create({ data: { courseId: ids.courseA, instructorId: ids.teacherA } });
    await prisma.courseInstructor.create({ data: { courseId: ids.courseB, instructorId: ids.teacherB } });

    const exam = await prisma.exam.create({ data: { title: `Final ${tag}`, courseId: ids.courseA } });
    const essay = await prisma.examQuestion.create({ data: { examId: exam.id, text: 'Explain', type: 'ESSAY', points: 5 } });
    const attempt = await prisma.examAttempt.create({ data: { studentId: ids.student, examId: exam.id, status: 'PENDING', submittedAt: new Date() } });
    await prisma.studentExamResponse.create({ data: { attemptId: attempt.id, questionId: essay.id } });
    ids.attempt = attempt.id;

    await prisma.profileUpdateRequest.create({ data: { studentId: ids.student, requestedFullName: 'New Name' } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.course.deleteMany({ where: { id: { in: [ids.courseA, ids.courseB].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@t.test` } } });
    }
    await app?.close();
  });

  it('attention counts include the waiting registration, request and exam', async () => {
    const { body } = await http().get('/admin/attention').set(as('admin')).expect(200);
    expect(body.pendingRegistrations).toBeGreaterThanOrEqual(1);
    expect(body.profileRequests).toBeGreaterThanOrEqual(1);
    expect(body.examsToGrade).toBeGreaterThanOrEqual(1);
    for (const k of ['quizAnswersToReview', 'failedNotifications', 'newStudents7d', 'activeStudents7d', 'unusedCodes', 'draftCourses']) {
      expect(typeof body[k]).toBe('number');
    }
  });

  it('attention is admin-only', async () => {
    await http().get('/admin/attention').set(as('teacherA')).expect(403);
    await http().get('/admin/attention').set(as('student')).expect(403);
  });

  it('grading queue: the course instructor and admins see it, other instructors do not', async () => {
    const mine = (await http().get('/instructor/dashboard/exams/pending').set(as('teacherA')).expect(200)).body;
    expect(mine.find((a: any) => a.attemptId === ids.attempt)).toMatchObject({ studentName: 'student', examTitle: `Final ${tag}`, ungradedEssaysCount: 1 });
    const other = (await http().get('/instructor/dashboard/exams/pending').set(as('teacherB')).expect(200)).body;
    expect(other.find((a: any) => a.attemptId === ids.attempt)).toBeUndefined();
    const admin = (await http().get('/instructor/dashboard/exams/pending').set(as('admin')).expect(200)).body;
    expect(admin.find((a: any) => a.attemptId === ids.attempt)).toBeTruthy();
    await http().get('/instructor/dashboard/exams/pending').set(as('student')).expect(403);
  });
});
