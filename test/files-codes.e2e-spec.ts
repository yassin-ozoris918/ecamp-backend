/**
 * E2E: the Files page code box (POST /activation-codes/redeem-files).
 * One box takes any code; the server works out what it is for, asks before spending a code on
 * something other than where it was typed, and explains every failure with a stable error code.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ActivationCodeType,
  CodeStatus,
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

describe('Files page code box (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let studentId: string;
  let otherId: string;
  let courseId: string;
  let lectureOpenId: string;
  let lectureLockedId: string;
  let fileA: string;
  let fileB: string;
  let fileC: string; // in the separately-sold lecture
  const suffix = Date.now();
  const codes: string[] = [];

  const hs = {
    educationLevel: EducationLevel.HIGH_SCHOOL,
    highSchoolSystem: HighSchoolSystem.TRADITIONAL,
    studyMode: StudyMode.ONLINE,
    studyLanguage: StudyLanguage.ARABIC,
    highSchoolGrade: HighSchoolGrade.GRADE_2,
    traditionalBranch: TraditionalBranch.SCIENCE,
  };

  async function makeCode(targetType: ActivationCodeType, extra: Partial<{ educationLevel: EducationLevel; status: CodeStatus; studentId: string }> = {}) {
    const code = `T${suffix.toString(16).toUpperCase()}-${codes.length.toString().padStart(4, '0')}-${targetType.slice(0, 4)}`;
    codes.push(code);
    await prisma.activationCode.create({
      data: { code, targetType, educationLevel: extra.educationLevel ?? EducationLevel.HIGH_SCHOOL, status: extra.status ?? CodeStatus.UNUSED, studentId: extra.studentId ?? null },
    });
    return code;
  }

  const box = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/activation-codes/redeem-files').set('Authorization', `Bearer ${token}`).set('x-device-id', 'files-dev').send(body);

  const files = async () =>
    (await request(app.getHttpServer()).get(`/attachments/student/files?courseId=${courseId}`).set('Authorization', `Bearer ${token}`).set('x-device-id', 'files-dev').expect(200)).body as any[];

  const status = async (code: string) => (await prisma.activationCode.findUnique({ where: { code } }))?.status;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const password = await bcrypt.hash('password123', 10);

    const student = await prisma.user.create({
      data: { email: `files-${suffix}@test.com`, fullName: 'Files Student', role: Role.STUDENT, password, isActive: true, deviceId: 'files-dev', ...hs },
    });
    studentId = student.id;
    const other = await prisma.user.create({
      data: { email: `files-other-${suffix}@test.com`, fullName: 'Other Student', role: Role.STUDENT, password, isActive: true, ...hs },
    });
    otherId = other.id;
    token = jwt.sign({ sub: student.id, email: student.email, role: Role.STUDENT, isImpersonating: false }, { secret: 'test_secret' });

    const course = await prisma.course.create({
      data: {
        title: `Physics ${suffix}`,
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
    const chapter = await prisma.chapter.create({ data: { courseId, title: 'Chapter 1', orderIndex: 0 } });
    const l1 = await prisma.lecture.create({ data: { courseId, chapterId: chapter.id, title: 'Lecture 1', isPublished: true } });
    const l2 = await prisma.lecture.create({ data: { courseId, chapterId: chapter.id, title: 'Revision (sold alone)', isPublished: true, requiresOwnCode: true, orderIndex: 1 } });
    lectureOpenId = l1.id;
    lectureLockedId = l2.id;
    fileA = (await prisma.attachment.create({ data: { lectureId: l1.id, title: 'Notes A', fileUrl: 'x', type: 'PDF' } })).id;
    fileB = (await prisma.attachment.create({ data: { lectureId: l1.id, title: 'Sheet B', fileUrl: 'x', type: 'SHEET', orderIndex: 1 } })).id;
    fileC = (await prisma.attachment.create({ data: { lectureId: l2.id, title: 'Revision C', fileUrl: 'x', type: 'PDF' } })).id;
  });

  afterAll(async () => {
    await prisma.activationCodeHistory.deleteMany({ where: { code: { in: codes } } });
    await prisma.activationCode.deleteMany({ where: { code: { in: codes } } });
    await prisma.studentFileAccess.deleteMany({ where: { studentId } });
    await prisma.studentLectureAccess.deleteMany({ where: { studentId } });
    await prisma.studentCourseAccess.deleteMany({ where: { studentId } });
    await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [studentId, otherId] } } });
    await app.close();
  });

  it('lists files with chapter and lecture info for grouping', async () => {
    const list = await files();
    expect(list).toHaveLength(3);
    const c = list.find((f) => f.id === fileC);
    expect(c.chapter.title).toBe('Chapter 1');
    expect(c.lecture.locked).toBe(true);
    expect(list.every((f) => f.accessStatus === 'LOCKED')).toBe(true);
  });

  it('explains an unknown code', async () => {
    const res = await box({ code: 'AAAA-BBBB-CCCC', courseId }).expect(404);
    expect(res.body.code).toBe('CODE_NOT_FOUND');
  });

  it('a course-files code typed on one file asks first, then opens the course files (not the separately-sold lecture)', async () => {
    const code = await makeCode(ActivationCodeType.COURSE_FILES);
    const ask = await box({ code, attachmentId: fileA }).expect(409);
    expect(ask.body.code).toBe('CONFIRM_COURSE_FILES');
    expect(ask.body.details).toMatchObject({ courseId, opens: 2, staysLocked: 1, thisFileStaysLocked: false });
    expect(await status(code)).toBe(CodeStatus.UNUSED);

    await box({ code, attachmentId: fileA, confirm: true }).expect(200);
    const list = await files();
    expect(list.find((f) => f.id === fileA).accessStatus).toBe('UNLOCKED');
    expect(list.find((f) => f.id === fileB).accessStatus).toBe('UNLOCKED');
    expect(list.find((f) => f.id === fileC).accessStatus).toBe('LOCKED');

    const again = await box({ code, courseId }).expect(403);
    expect(again.body.code).toBe('CODE_ALREADY_USED_BY_YOU');
    expect(again.body.details.usedOn).toBe(`Physics ${suffix}`);
  });

  it("someone else's used code and a code for another education level are explained", async () => {
    const used = await makeCode(ActivationCodeType.FILE, { status: CodeStatus.REDEEMED, studentId: otherId });
    expect((await box({ code: used, attachmentId: fileC }).expect(403)).body.code).toBe('CODE_ALREADY_USED');
    const uni = await makeCode(ActivationCodeType.FILE, { educationLevel: EducationLevel.UNIVERSITY });
    const res = await box({ code: uni, attachmentId: fileC }).expect(403);
    expect(res.body).toMatchObject({ code: 'CODE_WRONG_LEVEL', details: { codeLevel: 'UNIVERSITY', yourLevel: 'HIGH_SCHOOL' } });
  });

  it('a single-file code typed in the course box asks which file, then opens just that file', async () => {
    const code = await makeCode(ActivationCodeType.FILE);
    const ask = await box({ code, courseId }).expect(409);
    expect(ask.body).toMatchObject({ code: 'FILE_CODE_PICK_FILE', details: { courseId } });
    await box({ code, courseId, attachmentId: fileC }).expect(200);
    expect((await files()).find((f) => f.id === fileC).accessStatus).toBe('UNLOCKED');
  });

  it('a lecture code: guidance in the course box, an offer on a file', async () => {
    const code = await makeCode(ActivationCodeType.LECTURE);
    expect((await box({ code, courseId }).expect(400)).body.code).toBe('LECTURE_CODE_USE_LECTURE_PAGE');
    const ask = await box({ code, attachmentId: fileA }).expect(409);
    expect(ask.body).toMatchObject({ code: 'CONFIRM_LECTURE', details: { lectureId: lectureOpenId, lectureTitle: 'Lecture 1' } });
    expect(await status(code)).toBe(CodeStatus.UNUSED);
  });

  it('a full-course code asks first, then opens the course; a course-files code after that is not wasted', async () => {
    const code = await makeCode(ActivationCodeType.COURSE);
    expect((await box({ code, courseId }).expect(409)).body.code).toBe('CONFIRM_COURSE');
    await box({ code, courseId, confirm: true }).expect(200);
    expect(await prisma.studentCourseAccess.count({ where: { studentId, courseId } })).toBe(1);

    const extra = await makeCode(ActivationCodeType.COURSE_FILES);
    const res = await box({ code: extra, courseId }).expect(403);
    expect(res.body).toMatchObject({ code: 'ALREADY_HAVE_ACCESS' });
    expect(await status(extra)).toBe(CodeStatus.UNUSED);
    expect(lectureLockedId).toBeTruthy();
  });

  it('the old redeem endpoint now carries error codes too', async () => {
    const code = await makeCode(ActivationCodeType.COURSE_FILES);
    const res = await request(app.getHttpServer())
      .post('/activation-codes/redeem')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, targetType: 'FILE', targetId: fileA })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'CODE_WRONG_TYPE', details: { codeType: 'COURSE_FILES', expectedType: 'FILE' } });
  });
});
