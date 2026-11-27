/**
 * E2E: an admin gives a student the handouts of a course only (as if they redeemed a
 * course-files code), and takes it back.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  EducationLevel,
  HighSchoolGrade,
  HighSchoolSystem,
  Role,
  StudyLanguage,
  StudyMode,
  TraditionalBranch,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { App } from 'supertest/types';

jest.setTimeout(120000);

describe('Admin: handouts-only access (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let adminId: string;
  let studentId: string;
  let courseId: string;
  let fileOpen: string;
  let fileSoldAlone: string;
  let lectureId: string;
  const suffix = Date.now();

  const hs = {
    educationLevel: EducationLevel.HIGH_SCHOOL,
    highSchoolSystem: HighSchoolSystem.TRADITIONAL,
    studyMode: StudyMode.ONLINE,
    studyLanguage: StudyLanguage.ARABIC,
    highSchoolGrade: HighSchoolGrade.GRADE_2,
    traditionalBranch: TraditionalBranch.SCIENCE,
  };

  const admin = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/admin/users/${studentId}/${path}`).set('Authorization', `Bearer ${adminToken}`).send(body);

  const files = async () =>
    (
      await request(app.getHttpServer())
        .get(`/attachments/student/files?courseId=${courseId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('x-device-id', 'handouts-dev')
        .expect(200)
    ).body as any[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const password = await bcrypt.hash('password123', 10);

    const a = await prisma.user.create({ data: { email: `handouts-admin-${suffix}@test.com`, fullName: 'Admin', role: Role.ADMIN, password, isActive: true } });
    adminId = a.id;
    adminToken = jwt.sign({ sub: a.id, email: a.email, role: Role.ADMIN, isImpersonating: false }, { secret: 'test_secret' });
    const s = await prisma.user.create({
      data: { email: `handouts-${suffix}@test.com`, fullName: 'Handouts Student', role: Role.STUDENT, password, isActive: true, deviceId: 'handouts-dev', ...hs },
    });
    studentId = s.id;
    studentToken = jwt.sign({ sub: s.id, email: s.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });

    const course = await prisma.course.create({
      data: {
        title: `Mechanics ${suffix}`,
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
    const l1 = await prisma.lecture.create({ data: { courseId, title: 'Lecture 1', isPublished: true } });
    const l2 = await prisma.lecture.create({ data: { courseId, title: 'Revision (sold alone)', isPublished: true, requiresOwnCode: true, orderIndex: 1 } });
    lectureId = l1.id;
    fileOpen = (await prisma.attachment.create({ data: { lectureId: l1.id, title: 'Sheet 1', fileUrl: 'x', type: 'PDF' } })).id;
    fileSoldAlone = (await prisma.attachment.create({ data: { lectureId: l2.id, title: 'Revision sheet', fileUrl: 'x', type: 'PDF' } })).id;
  });

  afterAll(async () => {
    await prisma.studentFileAccess.deleteMany({ where: { studentId } });
    await prisma.studentLectureAccess.deleteMany({ where: { studentId } });
    await prisma.studentCourseAccess.deleteMany({ where: { studentId } });
    await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [studentId, adminId] } } });
    await app.close();
  });

  it('opens the course files like a course-files code, without opening the lectures', async () => {
    const res = await admin('grant-course-files', { courseId }).expect(201);
    expect(res.body.alreadyHad).toBe(false);

    const list = await files();
    const open = list.find((f) => f.id === fileOpen);
    expect(open.accessStatus).toBe('UNLOCKED');
    expect(open.accessSource).toBe('ADMIN_GRANT');
    // Files of a lecture sold separately stay locked, as with the code.
    expect(list.find((f) => f.id === fileSoldAlone).accessStatus).toBe('LOCKED');
    // Videos are not opened.
    expect(await prisma.studentCourseAccess.count({ where: { studentId, courseId } })).toBe(0);
    expect(await prisma.studentLectureAccess.count({ where: { studentId, lectureId } })).toBe(0);
  });

  it('granting twice keeps a single grant', async () => {
    const res = await admin('grant-course-files', { courseId }).expect(201);
    expect(res.body.alreadyHad).toBe(true);
    expect(await prisma.studentFileAccess.count({ where: { studentId, courseId } })).toBe(1);
  });

  it('shows on the student page', async () => {
    const res = await request(app.getHttpServer()).get(`/admin/users/${studentId}/progress`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const course = (res.body.coursesHistory ?? []).find((c: any) => c.courseId === courseId);
    expect(course).toMatchObject({ hasHandoutsAccess: true, handoutsSource: 'ADMIN_GRANT' });
  });

  it('removing it locks the files again', async () => {
    await admin('remove-course-files', { courseId }).expect(201);
    expect((await files()).find((f) => f.id === fileOpen).accessStatus).toBe('LOCKED');
    await admin('remove-course-files', { courseId }).expect(404);
  });

  it('is refused when the student already has the whole course', async () => {
    await prisma.studentCourseAccess.create({ data: { studentId, courseId } });
    const res = await admin('grant-course-files', { courseId }).expect(400);
    expect(res.body.message).toMatch(/whole course/);
  });

  it('only admins can do it', async () => {
    await request(app.getHttpServer())
      .post(`/admin/users/${studentId}/grant-course-files`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseId })
      .expect(403);
  });
});
