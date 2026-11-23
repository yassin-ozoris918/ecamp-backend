/**
 * E2E: renaming, moving lectures between chapters/courses, copying lectures, locked lectures
 * ("needs its own code") and moving handouts. Needs a disposable Postgres in DATABASE_URL.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { filterUnreferencedUrls } from '../src/common/storage-refs';

jest.setTimeout(120000);

describe('Content organizer + locked lectures (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const tag = `org-${Date.now()}`;
  const VIDEO_1 = `https://video.test/${tag}/1.mp4`;
  const FILE_URL = `https://files.test/${tag}/notes.pdf`;

  const http = () => request(app.getHttpServer());
  // The real app always sends a device id (video streaming requires it).
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}`, 'x-device-id': `device-${who}-${tag}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue({
        uploadFile: async () => `https://files.test/${randomUUID()}.pdf`,
        generatePresignedGetUrl: async () => 'https://signed.test/file',
      })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);

    const mkUser = async (key: string, role: Role) => {
      const u = await prisma.user.create({
        // deviceId = the device registered at login (video streaming checks it)
        data: { fullName: key, email: `${key}-${tag}@t.test`, password: 'x', role, educationLevel: 'UNIVERSITY', deviceId: `device-${key}-${tag}` },
      });
      ids[key] = u.id;
      tokens[key] = jwt.sign({ sub: u.id, email: u.email, role }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });
    };
    await mkUser('admin', Role.ADMIN);
    for (const k of ['full', 'buyer', 'filesOnly', 'fileBuyer', 'studentB']) await mkUser(k, Role.STUDENT);

    const mkCourse = (title: string, extra: any = {}) =>
      prisma.course.create({ data: { title: `${title} ${tag}`, status: 'PUBLISHED', audienceType: 'UNIVERSITY', ...extra } });
    ids.A = (await mkCourse('A')).id;
    ids.B = (await mkCourse('B')).id;
    ids.M = (await mkCourse('Materials', { type: 'MATERIALS_ONLY' })).id;
    ids.A1 = (await prisma.chapter.create({ data: { courseId: ids.A, title: 'Chapter A1' } })).id;
    ids.A2 = (await prisma.chapter.create({ data: { courseId: ids.A, title: 'Chapter A2' } })).id;
    ids.B1 = (await prisma.chapter.create({ data: { courseId: ids.B, title: 'Chapter B1' } })).id;
    ids.L = (await prisma.lecture.create({ data: { courseId: ids.A, chapterId: ids.A1, title: 'Lecture L' } })).id;
    ids.L2 = (await prisma.lecture.create({ data: { courseId: ids.A, chapterId: ids.A2, title: 'Lecture L2' } })).id;
    ids.S1 = (await prisma.session.create({ data: { lectureId: ids.L, title: 'Part 1', videoUrl: VIDEO_1, sortOrder: 0 } })).id;
    ids.S2 = (await prisma.session.create({ data: { lectureId: ids.L, title: 'Part 2', videoUrl: `https://video.test/${tag}/2.mp4`, sortOrder: 1 } })).id;
    ids.F1 = (await prisma.attachment.create({ data: { lectureId: ids.L, title: 'Notes', fileUrl: FILE_URL } })).id;
    const quiz = await prisma.quiz.create({ data: { lectureId: ids.L, title: 'Quiz 1', sortOrder: 2 } });
    await prisma.quizQuestion.create({ data: { quizId: quiz.id, text: '2+2?', options: ['3', '4'], correctOptionIndex: 1 } });
    ids.Q = quiz.id;
    ids.CHF = (await prisma.chapterAttachment.create({ data: { chapterId: ids.A1, title: 'Chapter handout', fileUrl: `https://files.test/${tag}/ch.pdf` } })).id;

    await prisma.studentCourseAccess.create({ data: { studentId: ids.full, courseId: ids.A } });
    await prisma.studentCourseAccess.create({ data: { studentId: ids.studentB, courseId: ids.B } });
    await prisma.studentFileAccess.create({ data: { studentId: ids.filesOnly, courseId: ids.A, source: 'COURSE_FILES_CODE' } });
    await prisma.studentFileAccess.create({ data: { studentId: ids.fileBuyer, attachmentId: ids.F1, source: 'FILE_CODE' } });
    // The buyer redeems a generic lecture code through the real endpoint
    await prisma.activationCode.create({ data: { code: `LEC-${tag}-1`, targetType: 'LECTURE', educationLevel: 'UNIVERSITY' } });
    await http().post('/activation-codes/redeem').set(as('buyer')).send({ code: `LEC-${tag}-1`, targetType: 'LECTURE', targetId: ids.L }).expect(200);
    // The full-course student opens the lecture through the course (creates a COURSE access row)
    await http().post(`/lectures/${ids.L}/start-access`).set(as('full')).expect(201);
  });

  afterAll(async () => {
    if (prisma) {
      const courses = [ids.A, ids.B, ids.M].filter(Boolean);
      await prisma.notificationEvent.deleteMany({ where: { courseId: { in: courses } } });
      await prisma.course.deleteMany({ where: { id: { in: courses } } });
      await prisma.activationCode.deleteMany({ where: { code: { startsWith: `LEC-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@t.test` } } });
    }
    await app?.close();
  });

  // ─── 1. Rename everything ───────────────────────────────────────────────────
  it('renames chapters, lectures, sessions, quizzes, exams and files; rejects empty names', async () => {
    await http().put(`/chapters/${ids.A1}`).set(as('admin')).send({ title: 'Anatomy basics' }).expect(200);
    await http().put(`/lectures/${ids.L}`).set(as('admin')).send({ title: 'Upper limb' }).expect(200);
    await http().put(`/sessions/${ids.S1}`).set(as('admin')).send({ title: 'Shoulder' }).expect(200);
    await http().put(`/quizzes/${ids.Q}`).set(as('admin')).send({ title: 'Check-up quiz' }).expect(200);
    await http().patch(`/content/materials/lecture/${ids.F1}`).set(as('admin')).send({ title: '  Upper limb notes  ' }).expect(200);
    await http().patch(`/content/materials/chapter/${ids.CHF}`).set(as('admin')).send({ title: 'Chapter summary' }).expect(200);

    expect((await prisma.chapter.findFirst({ where: { id: ids.A1 } }))!.title).toBe('Anatomy basics');
    expect((await prisma.lecture.findFirst({ where: { id: ids.L } }))!.title).toBe('Upper limb');
    expect((await prisma.session.findFirst({ where: { id: ids.S1 } }))!.title).toBe('Shoulder');
    expect((await prisma.quiz.findFirst({ where: { id: ids.Q } }))!.title).toBe('Check-up quiz');
    expect((await prisma.attachment.findFirst({ where: { id: ids.F1 } }))!.title).toBe('Upper limb notes');
    expect((await prisma.chapterAttachment.findFirst({ where: { id: ids.CHF } }))!.title).toBe('Chapter summary');

    await http().put(`/chapters/${ids.A1}`).set(as('admin')).send({ title: '' }).expect(400);
    await http().put(`/lectures/${ids.L}`).set(as('admin')).send({ title: '' }).expect(400);
    await http().patch(`/content/materials/lecture/${ids.F1}`).set(as('admin')).send({ title: '   ' }).expect(400);
    // A plain update can no longer silently move content
    await http().put(`/lectures/${ids.L}`).set(as('admin')).send({ courseId: ids.B }).expect(400);
    await http().put(`/sessions/${ids.S1}`).set(as('admin')).send({ lectureId: ids.L2 }).expect(400);
    // Students cannot use the organizer
    await http().patch(`/content/materials/lecture/${ids.F1}`).set(as('full')).send({ title: 'x' }).expect(403);
  });

  it('exam settings (incl. the name) save correctly', async () => {
    const exam = await prisma.exam.create({ data: { title: 'Final', courseId: ids.A } });
    await http().put(`/admin/exams/${exam.id}`).set(as('admin')).send({ title: 'Final exam', passingScore: 65, maxAttempts: 2 }).expect(200);
    const saved = await prisma.exam.findFirst({ where: { id: exam.id } });
    expect(saved).toMatchObject({ title: 'Final exam', passGrade: 65, maxAttempts: 2 });
  });

  // ─── 3. Locked lecture ──────────────────────────────────────────────────────
  it('locked lecture: full-course and materials students lose it; code buyers and single-file buyers keep theirs', async () => {
    await http().put(`/lectures/${ids.L}`).set(as('admin')).send({ requiresOwnCode: true }).expect(200);

    const playlist = (who: string) => http().get(`/progress/playlist/${ids.L}`).set(as(who));
    expect((await playlist('full').expect(200)).body).toMatchObject({ isLocked: true, requiresOwnCode: true });
    await http().get(`/lectures/sessions/${ids.S1}/stream-token`).set(as('full')).expect(403);
    await http().get(`/attachments/${ids.F1}/view`).set(as('full')).expect(403);
    await http().get(`/attachments/${ids.F1}/view`).set(as('filesOnly')).expect(403);
    await http().get(`/attachments/${ids.F1}/view`).set(as('fileBuyer')).expect(200); // bought this exact file

    const syllabus = (await http().get(`/progress/course/${ids.A}/syllabus`).set(as('full')).expect(200)).body;
    const lec = JSON.stringify(syllabus).includes('"requiresOwnCode":true');
    expect(lec).toBe(true);

    // Buyer (lecture code) still has it
    expect((await playlist('buyer').expect(200)).body.isLocked).toBe(false);
    await http().post(`/lectures/${ids.L}/start-access`).set(as('buyer')).expect(201);
    await http().get(`/lectures/sessions/${ids.S1}/stream-token`).set(as('buyer')).expect(200);
    await http().get(`/attachments/${ids.F1}/view`).set(as('buyer')).expect(200);

    // The full-course student can now buy it with a lecture code (their course-derived row is upgraded)
    await prisma.activationCode.create({ data: { code: `LEC-${tag}-2`, targetType: 'LECTURE', educationLevel: 'UNIVERSITY' } });
    await http().post('/activation-codes/redeem').set(as('full')).send({ code: `LEC-${tag}-2`, targetType: 'LECTURE', targetId: ids.L }).expect(200);
    const row = await prisma.studentLectureAccess.findFirst({ where: { studentId: ids.full, lectureId: ids.L } });
    expect(row).toMatchObject({ source: 'CODE', isStarted: false });
    expect((await playlist('full').expect(200)).body.isLocked).toBe(false);

    // Unlock again → materials student gets the files back through the course
    await http().put(`/lectures/${ids.L}`).set(as('admin')).send({ requiresOwnCode: false }).expect(200);
    await http().get(`/attachments/${ids.F1}/view`).set(as('filesOnly')).expect(200);
  });

  // ─── 2. Move between chapters ───────────────────────────────────────────────
  it('moves a lecture to another chapter of the same course without touching access', async () => {
    const before = await prisma.studentLectureAccess.count({ where: { lectureId: ids.L } });
    const res = await http().post(`/content/lectures/${ids.L}/move`).set(as('admin')).send({ courseId: ids.A, chapterId: ids.A2 }).expect(200);
    expect(res.body.movedToAnotherCourse).toBe(false);
    expect((await prisma.lecture.findFirst({ where: { id: ids.L } }))!.chapterId).toBe(ids.A2);
    expect(await prisma.studentLectureAccess.count({ where: { lectureId: ids.L } })).toBe(before);
    // Lands at the end of the target chapter
    const l2 = await prisma.lecture.findFirst({ where: { id: ids.L2 } });
    expect((await prisma.lecture.findFirst({ where: { id: ids.L } }))!.sortOrder).toBeGreaterThan(l2!.sortOrder);
    // Chapter of another course is rejected; "no chapter" works
    await http().post(`/content/lectures/${ids.L}/move`).set(as('admin')).send({ courseId: ids.A, chapterId: ids.B1 }).expect(400);
    await http().post(`/content/lectures/${ids.L}/move`).set(as('admin')).send({ courseId: ids.A, chapterId: null }).expect(200);
    expect((await prisma.lecture.findFirst({ where: { id: ids.L } }))!.chapterId).toBeNull();
  });

  // ─── 5. Handout placement ───────────────────────────────────────────────────
  it('moves and reorders handouts between lectures, chapters and the course level', async () => {
    // Lecture → other lecture: same row, buyers keep it
    await http().post(`/content/materials/lecture/${ids.F1}/move`).set(as('admin')).send({ targetKind: 'lecture', targetId: ids.L2 }).expect(200);
    expect((await prisma.attachment.findFirst({ where: { id: ids.F1 } }))!.lectureId).toBe(ids.L2);
    expect(await prisma.studentFileAccess.count({ where: { attachmentId: ids.F1 } })).toBe(1);
    // A file bought with a single-file code cannot leave the lecture level
    await http().post(`/content/materials/lecture/${ids.F1}/move`).set(as('admin')).send({ targetKind: 'chapter', targetId: ids.A1 }).expect(409);

    // Chapter file → lecture: becomes visible to students and is announced
    const res = await http().post(`/content/materials/chapter/${ids.CHF}/move`).set(as('admin')).send({ targetKind: 'lecture', targetId: ids.L2 }).expect(200);
    expect(res.body.kind).toBe('lecture');
    expect(await prisma.chapterAttachment.count({ where: { id: ids.CHF } })).toBe(0);
    const moved = await prisma.attachment.findFirst({ where: { id: res.body.id } });
    expect(moved).toMatchObject({ lectureId: ids.L2, title: 'Chapter summary' });
    expect(await prisma.notificationEvent.count({ where: { targetId: res.body.id, type: 'MATERIAL_ADDED' } })).toBe(1);

    // …and back to the course level (no buyers → allowed)
    const back = await http().post(`/content/materials/lecture/${res.body.id}/move`).set(as('admin')).send({ targetKind: 'course', targetId: ids.A }).expect(200);
    expect(back.body.kind).toBe('course');
    expect(await prisma.courseAttachment.count({ where: { id: back.body.id, courseId: ids.A } })).toBe(1);

    // Reorder lecture files
    const extra = await prisma.attachment.create({ data: { lectureId: ids.L2, title: 'Extra', fileUrl: `https://files.test/${tag}/x.pdf`, orderIndex: 5 } });
    await http().put(`/content/lectures/${ids.L2}/materials/order`).set(as('admin')).send({ ids: [ids.F1] }).expect(400); // incomplete list
    await http().put(`/content/lectures/${ids.L2}/materials/order`).set(as('admin')).send({ ids: [extra.id, ids.F1] }).expect(200);
    const list = (await http().get(`/attachments/lecture/${ids.L2}`).set(as('admin')).expect(200)).body;
    expect(list.map((f: any) => f.id)).toEqual([extra.id, ids.F1]);

    // Move F1 back to L for the next tests
    await http().post(`/content/materials/lecture/${ids.F1}/move`).set(as('admin')).send({ targetKind: 'lecture', targetId: ids.L }).expect(200);
  });

  // ─── 4. Copy & move to another course ───────────────────────────────────────
  it('copies a lecture (sessions, files, quiz with questions) into another course and announces it', async () => {
    const res = await http().post(`/content/lectures/${ids.L}/copy`).set(as('admin')).send({ courseId: ids.B, chapterId: ids.B1 }).expect(201);
    expect(res.body.copied).toEqual({ sessions: 2, files: 1, quizzes: 1 });
    ids.COPY = res.body.lecture.id;
    const copy = await prisma.lecture.findFirst({ where: { id: ids.COPY }, include: { sessions: true, attachments: true, quizzes: { include: { questions: true } } } });
    expect(copy).toMatchObject({ courseId: ids.B, chapterId: ids.B1, title: 'Upper limb' });
    expect(copy!.sessions.map((s) => s.videoUrl)).toContain(VIDEO_1);
    expect(copy!.attachments[0].fileUrl).toBe(FILE_URL);
    expect(copy!.quizzes[0].questions[0]).toMatchObject({ text: '2+2?', correctOptionIndex: 1 });
    // No student data copied
    expect(await prisma.studentLectureAccess.count({ where: { lectureId: ids.COPY } })).toBe(0);
    // Students of course B are told about the new lecture
    const events = await prisma.notificationEvent.findMany({ where: { lectureId: ids.COPY } });
    expect(events.filter((e) => e.type === 'LECTURE_ADDED')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'MATERIAL_ADDED')).toHaveLength(1);
  });

  it('shared videos/files are only deleted from storage when the LAST copy is deleted', async () => {
    expect(await filterUnreferencedUrls(prisma, [VIDEO_1, FILE_URL])).toEqual([]); // both copies use them
    await http().delete(`/lectures/${ids.COPY}`).set(as('admin')).expect(200);
    expect(await filterUnreferencedUrls(prisma, [VIDEO_1, FILE_URL])).toEqual([]); // original still uses them
    expect(await filterUnreferencedUrls(prisma, ['https://nobody.test/x.mp4'])).toEqual(['https://nobody.test/x.mp4']);
  });

  it('refuses to move a lecture with videos into a materials-only course', async () => {
    await http().post(`/content/lectures/${ids.L}/move`).set(as('admin')).send({ courseId: ids.M }).expect(400);
    await http().post(`/content/lectures/${ids.L}/copy`).set(as('admin')).send({ courseId: ids.M }).expect(400);
  });

  it('moving to another course resets ALL individual access and re-targets notifications', async () => {
    await prisma.notificationEvent.create({
      data: { type: 'SESSION_ADDED', dedupeKey: `old-${tag}`, groupKey: `VIDEO:${ids.L}`, courseId: ids.A, lectureId: ids.L, targetId: ids.S1, itemTitle: 'x', status: 'DONE' },
    });
    expect(await prisma.studentLectureAccess.count({ where: { lectureId: ids.L } })).toBeGreaterThan(0);

    const res = await http().post(`/content/lectures/${ids.L}/move`).set(as('admin')).send({ courseId: ids.B, chapterId: ids.B1 }).expect(200);
    expect(res.body.movedToAnotherCourse).toBe(true);
    expect(res.body.studentAccessRemoved).toBeGreaterThan(0);
    expect(await prisma.studentLectureAccess.count({ where: { lectureId: ids.L } })).toBe(0);
    expect((await prisma.lecture.findFirst({ where: { id: ids.L } }))).toMatchObject({ courseId: ids.B, chapterId: ids.B1 });

    // Old course's notification is gone; new course gets "new lecture" events
    expect(await prisma.notificationEvent.count({ where: { dedupeKey: `old-${tag}` } })).toBe(0);
    const events = await prisma.notificationEvent.findMany({ where: { lectureId: ids.L } });
    expect(events.every((e) => e.courseId === ids.B)).toBe(true);
    expect(events.filter((e) => e.type === 'LECTURE_ADDED').length).toBe(2);

    // Old buyer lost it; a course-B student can open it; the course-A student cannot
    expect((await http().get(`/progress/playlist/${ids.L}`).set(as('buyer')).expect(200)).body.isLocked).toBe(true);
    expect((await http().get(`/progress/playlist/${ids.L}`).set(as('studentB')).expect(200)).body.isLocked).toBe(false);
    expect((await http().get(`/progress/playlist/${ids.L}`).set(as('full')).expect(200)).body.isLocked).toBe(true);
  });
});
