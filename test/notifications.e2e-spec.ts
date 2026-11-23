/**
 * E2E: student in-app notifications for new lectures / sessions / materials.
 *
 * Needs a disposable Postgres in DATABASE_URL (it creates and deletes its own rows).
 * Covers: who is notified for each enrollment type, burst merging, idempotency under two
 * concurrent workers, cancellation when content is deleted before delivery, time-zone safety
 * of the due-date check, and the student HTTP API (ownership, read / read-all, role guard).
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
import { NotificationWorkerService } from '../src/notifications/notification-worker.service';
import { NotificationRecipientsService } from '../src/notifications/notification-recipients';

jest.setTimeout(120000);

describe('Student content notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let worker: NotificationWorkerService;
  let worker2: NotificationWorkerService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const tag = `notif-${Date.now()}`;

  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const inboxOf = (who: string) =>
    prisma.notification.findMany({ where: { userId: ids[who] }, orderBy: { createdAt: 'asc' } });

  /** Make everything pending due now and run two workers at the same time (simulates 2 API instances). */
  async function deliver() {
    await prisma.notificationEvent.updateMany({
      where: { status: 'PENDING', courseId: { in: [ids.C1, ids.C2, ids.C3] } },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });
    await Promise.all([worker.tick(), worker2.processDueBatch()]);
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue({ uploadFile: async () => `https://files.test/${randomUUID()}.pdf` })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    worker = app.get(NotificationWorkerService);
    worker2 = new NotificationWorkerService(prisma, app.get(NotificationRecipientsService));
    const jwt = app.get(JwtService);

    const mkUser = async (key: string, role: Role, extra: any = {}) => {
      const u = await prisma.user.create({
        data: { fullName: key, email: `${key}-${tag}@t.test`, password: 'x', role, educationLevel: 'UNIVERSITY', ...extra },
      });
      ids[key] = u.id;
      tokens[key] = jwt.sign({ sub: u.id, email: u.email, role }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });
    };
    await mkUser('admin', Role.ADMIN);
    for (const k of ['full', 'lectureCode', 'filesOnly', 'expired', 'otherLecture', 'highSchool', 'materialsCourse', 'draftCourse']) {
      await mkUser(k, Role.STUDENT, k === 'highSchool' ? { educationLevel: 'HIGH_SCHOOL' } : {});
    }

    const c1 = await prisma.course.create({ data: { title: `Anatomy ${tag}`, status: 'PUBLISHED', audienceType: 'UNIVERSITY' } });
    const c2 = await prisma.course.create({ data: { title: `Handouts ${tag}`, status: 'PUBLISHED', type: 'MATERIALS_ONLY', audienceType: 'UNIVERSITY' } });
    const c3 = await prisma.course.create({ data: { title: `Draft ${tag}`, status: 'DRAFT', audienceType: 'UNIVERSITY' } });
    Object.assign(ids, { C1: c1.id, C2: c2.id, C3: c3.id });
    ids.L1 = (await prisma.lecture.create({ data: { courseId: c1.id, title: 'Lecture 1' } })).id;
    ids.L2 = (await prisma.lecture.create({ data: { courseId: c1.id, title: 'Lecture 2' } })).id;
    ids.LM = (await prisma.lecture.create({ data: { courseId: c2.id, title: 'Week 1' } })).id;
    ids.LD = (await prisma.lecture.create({ data: { courseId: c3.id, title: 'Draft lecture' } })).id;

    await prisma.studentCourseAccess.createMany({
      data: [
        { studentId: ids.full, courseId: c1.id },
        { studentId: ids.expired, courseId: c1.id, expiresAt: new Date(Date.now() - 86400000) },
        { studentId: ids.highSchool, courseId: c1.id }, // wrong audience → never eligible
        { studentId: ids.draftCourse, courseId: c3.id },
      ],
    });
    await prisma.studentLectureAccess.createMany({
      data: [
        { studentId: ids.lectureCode, lectureId: ids.L1 },
        { studentId: ids.otherLecture, lectureId: ids.L2 },
      ],
    });
    await prisma.studentFileAccess.createMany({
      data: [
        { studentId: ids.filesOnly, courseId: c1.id, source: 'COURSE_FILES_CODE' },
        { studentId: ids.materialsCourse, courseId: c2.id, source: 'COURSE_FILES_CODE' },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.course.deleteMany({ where: { id: { in: [ids.C1, ids.C2, ids.C3].filter(Boolean) } } });
      await prisma.notificationEvent.deleteMany({ where: { courseId: { in: [ids.C1, ids.C2, ids.C3].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@t.test` } } });
    }
    await app?.close();
  });

  it('a burst of videos in a new lecture → ONE "new lecture" notification, only for students who can watch it', async () => {
    const post = (title: string, videoUrl?: string) =>
      request(app.getHttpServer()).post('/sessions').set(as('admin')).send({ lectureId: ids.L1, title, ...(videoUrl ? { videoUrl } : {}) });

    expect((await post('Part 1', 'https://video.test/1.mp4')).status).toBe(201);
    expect((await post('Part 2', 'https://video.test/2.mp4')).status).toBe(201);
    // Part 3 is created empty and gets its video later (the real upload flow)
    const p3 = await post('Part 3');
    expect(p3.status).toBe(201);
    const put = await request(app.getHttpServer()).put(`/sessions/${p3.body.id}`).set(as('admin')).send({ videoUrl: 'https://video.test/3.mp4' });
    expect(put.status).toBe(200);
    // Replacing a video is not new content
    await request(app.getHttpServer()).put(`/sessions/${p3.body.id}`).set(as('admin')).send({ videoUrl: 'https://video.test/3b.mp4' });

    expect(await prisma.notificationEvent.count({ where: { lectureId: ids.L1 } })).toBe(3);
    await deliver();

    const full = await inboxOf('full');
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ type: 'LECTURE_ADDED', link: `/lecture/${ids.L1}` });
    expect(full[0].params).toMatchObject({ count: 3, lectureTitle: 'Lecture 1', courseTitle: `Anatomy ${tag}` });
    expect(await inboxOf('lectureCode')).toHaveLength(1);

    for (const who of ['filesOnly', 'expired', 'otherLecture', 'highSchool', 'admin', 'materialsCourse']) {
      expect(await inboxOf(who)).toHaveLength(0);
    }
  });

  it('a later video in the same lecture → "new session" notification', async () => {
    await request(app.getHttpServer()).post('/sessions').set(as('admin')).send({ lectureId: ids.L1, title: 'Part 4', videoUrl: 'https://video.test/4.mp4' });
    await deliver();
    const full = await inboxOf('full');
    expect(full).toHaveLength(2);
    expect(full[1]).toMatchObject({ type: 'SESSION_ADDED' });
    expect(full[1].params).toMatchObject({ count: 1, itemTitle: 'Part 4' });
  });

  it('a new handout reaches full-course, lecture-code and materials students, each with a link they can open', async () => {
    const res = await request(app.getHttpServer())
      .post('/attachments')
      .set(as('admin'))
      .field('title', 'Chapter 1 notes')
      .field('lectureId', ids.L1)
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'notes.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    await deliver();

    const last = async (who: string) => (await inboxOf(who)).filter((n) => n.type === 'MATERIAL_ADDED');
    expect((await last('full'))[0].link).toBe(`/lecture/${ids.L1}`);
    expect((await last('lectureCode'))[0].link).toBe(`/lecture/${ids.L1}`);
    expect((await last('filesOnly'))[0].link).toBe('/files');
    expect((await last('expired'))[0].link).toBe('/files'); // file access does not expire with the course
    expect(await last('otherLecture')).toHaveLength(0);
    expect(await last('highSchool')).toHaveLength(0);
  });

  it('materials-only course: students with a materials code are notified and sent to My Files', async () => {
    const res = await request(app.getHttpServer())
      .post('/attachments')
      .set(as('admin'))
      .field('title', 'Week 1 summary')
      .field('lectureId', ids.LM)
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'w1.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    await deliver();
    const inbox = await inboxOf('materialsCourse');
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ type: 'MATERIAL_ADDED', link: '/files' });
  });

  it('draft course: nothing is sent', async () => {
    await request(app.getHttpServer()).post('/sessions').set(as('admin')).send({ lectureId: ids.LD, title: 'x', videoUrl: 'https://video.test/d.mp4' });
    await deliver();
    expect(await inboxOf('draftCourse')).toHaveLength(0);
  });

  it('content deleted before delivery → its notification is cancelled', async () => {
    const before = (await inboxOf('full')).length;
    const s = await request(app.getHttpServer()).post('/sessions').set(as('admin')).send({ lectureId: ids.L2, title: 'Oops', videoUrl: 'https://video.test/o.mp4' });
    expect(await prisma.notificationEvent.count({ where: { targetId: s.body.id } })).toBe(1);
    await request(app.getHttpServer()).delete(`/sessions/${s.body.id}`).set(as('admin')).expect(200);
    expect(await prisma.notificationEvent.count({ where: { targetId: s.body.id } })).toBe(0);
    await deliver();
    expect(await inboxOf('full')).toHaveLength(before);
    expect(await inboxOf('otherLecture')).toHaveLength(0);
  });

  it('an event scheduled in the future is not delivered early (DB time zone is not UTC)', async () => {
    await request(app.getHttpServer()).post('/sessions').set(as('admin')).send({ lectureId: ids.L2, title: 'Later', videoUrl: 'https://video.test/l.mp4' });
    await prisma.notificationEvent.updateMany({
      where: { lectureId: ids.L2, status: 'PENDING' },
      data: { scheduledFor: new Date(Date.now() + 30 * 60 * 1000) },
    });
    await worker.tick();
    expect(await prisma.notificationEvent.count({ where: { lectureId: ids.L2, status: 'PENDING' } })).toBe(1);
    expect(await inboxOf('otherLecture')).toHaveLength(0);
    await deliver();
    expect(await inboxOf('otherLecture')).toHaveLength(1);
  });

  it('student API: badge count, list, read one, read all, ownership and role guard', async () => {
    const http = () => request(app.getHttpServer());
    const count0 = (await http().get('/notifications/unread-count').set(as('full')).expect(200)).body.count;
    expect(count0).toBe((await inboxOf('full')).length);

    const page = (await http().get('/notifications?limit=2').set(as('full')).expect(200)).body;
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    expect(new Date(page.items[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(page.items[1].createdAt).getTime());
    const page2 = (await http().get(`/notifications?limit=50&cursor=${page.nextCursor}`).set(as('full')).expect(200)).body;
    expect(page2.items.map((i: any) => i.id)).not.toContain(page.items[0].id);
    expect(page.items.length + page2.items.length).toBe(count0);

    const r = (await http().patch(`/notifications/${page.items[0].id}/read`).set(as('full')).expect(200)).body;
    expect(r.unreadCount).toBe(count0 - 1);

    // Another student cannot mark my notification as read
    const mine = (await inboxOf('full')).find((n) => !n.readAt)!;
    await http().patch(`/notifications/${mine.id}/read`).set(as('lectureCode')).expect(200);
    expect((await prisma.notification.findUnique({ where: { id: mine.id } }))!.readAt).toBeNull();

    expect((await http().post('/notifications/read-all').set(as('full')).expect(200)).body.unreadCount).toBe(0);
    expect((await http().get('/notifications/unread-count').set(as('full')).expect(200)).body.count).toBe(0);

    await http().get('/notifications').set(as('admin')).expect(403);
    await http().get('/notifications').expect(401);
    await http().patch('/notifications/not-a-uuid/read').set(as('full')).expect(400);
  });

  it('deleting a lecture removes the notifications that point to it', async () => {
    expect((await inboxOf('lectureCode')).length).toBeGreaterThan(0);
    await request(app.getHttpServer()).delete(`/lectures/${ids.L1}`).set(as('admin')).expect(200);
    expect((await inboxOf('lectureCode')).filter((n) => n.lectureId === ids.L1)).toHaveLength(0);
  });

  it('every event was finished exactly once (no duplicates, nothing stuck)', async () => {
    const stuck = await prisma.notificationEvent.count({
      where: { courseId: { in: [ids.C1, ids.C2, ids.C3] }, status: { in: ['PROCESSING', 'FAILED'] } },
    });
    expect(stuck).toBe(0);
    const dupes = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM (SELECT "eventId","userId" FROM "Notification" GROUP BY 1,2 HAVING COUNT(*) > 1) d`;
    expect(Number(dupes[0].c)).toBe(0);
  });
});
