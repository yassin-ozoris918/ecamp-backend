/**
 * E2E: student dashboard "continue learning" + course page progress data.
 * Needs a disposable Postgres in DATABASE_URL.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(120000);

describe('Student progress views (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const ids: Record<string, string> = {};
  const tag = `prog-${Date.now()}`;
  const H = (n: number) => new Date(Date.now() + n * 3_600_000);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const u = await prisma.user.create({ data: { fullName: 'S', email: `s-${tag}@t.test`, password: 'x', role: 'STUDENT', educationLevel: 'UNIVERSITY' } });
    ids.student = u.id;
    token = app.get(JwtService).sign({ sub: u.id, email: u.email, role: 'STUDENT' }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });

    const c = await prisma.course.create({ data: { title: `Course ${tag}`, status: 'PUBLISHED', audienceType: 'UNIVERSITY' } });
    ids.course = c.id;
    const ch = await prisma.chapter.create({ data: { courseId: c.id, title: 'Chapter A' } });
    const mk = async (title: string, extra: any = {}) => {
      const l = await prisma.lecture.create({ data: { courseId: c.id, chapterId: ch.id, title, ...extra } });
      const s1 = await prisma.session.create({ data: { lectureId: l.id, title: `${title} p1`, videoUrl: 'https://v.test/1.mp4', duration: 600, sortOrder: 0 } });
      const s2 = await prisma.session.create({ data: { lectureId: l.id, title: `${title} p2`, videoUrl: 'https://v.test/2.mp4', duration: 900, sortOrder: 1 } });
      return { l, s1, s2 };
    };
    const old = await mk('Old in progress');            // started long ago, half done
    const recent = await mk('Recent in progress');      // most recent activity, half done, ends in 30h
    const expired = await mk('Expired');                // timer ran out
    const done = await mk('Done');                      // fully completed
    const locked = await mk('Locked', { requiresOwnCode: true }); // locked; only course access → not usable
    Object.assign(ids, { old: old.l.id, recent: recent.l.id, expired: expired.l.id, done: done.l.id, locked: locked.l.id });
    await prisma.attachment.create({ data: { lectureId: recent.l.id, title: 'notes.pdf', fileUrl: 'https://f.test/n.pdf' } });

    await prisma.studentCourseAccess.create({ data: { studentId: u.id, courseId: c.id, expiresAt: H(24 * 5) } }); // course ends in 5 days
    const access = (lectureId: string, expiresAt: Date | null, source: any = 'COURSE') =>
      prisma.studentLectureAccess.create({ data: { studentId: u.id, lectureId, isStarted: true, activatedAt: H(-48), expiresAt, source } });
    await access(old.l.id, H(200));
    await access(recent.l.id, H(30));
    await access(expired.l.id, H(-1));
    await access(done.l.id, H(10));
    await access(locked.l.id, H(100)); // course-derived row → ignored for a locked lecture

    const progress = (sessionId: string, minutesAgo: number) =>
      prisma.sessionProgress.create({ data: { studentId: u.id, sessionId, isCompleted: true, completedAt: new Date(Date.now() - minutesAgo * 60000) } });
    await progress(old.s1.id, 600);
    await progress(recent.s1.id, 5);
    await progress(expired.s1.id, 1);
    await progress(done.s1.id, 900);
    await progress(done.s2.id, 890);
    await progress(locked.s1.id, 0); // newest activity of all, but the lecture is locked for this student
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.course.deleteMany({ where: { id: ids.course } });
      await prisma.user.deleteMany({ where: { id: ids.student } });
    }
    await app?.close();
  });

  it('continue: resumes the most recently active lecture that is still open and unfinished', async () => {
    const res = await request(app.getHttpServer()).get('/progress/continue').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.resume).toMatchObject({
      lectureId: ids.recent,
      chapterTitle: 'Chapter A',
      done: 1,
      total: 2,
      nextItemTitle: 'Recent in progress p2',
    });
    // Ending within 72h and unfinished: "recent" (30h). Not the expired, finished or locked ones.
    expect(res.body.endingSoon.map((l: any) => l.lectureId)).toEqual([ids.recent]);
    // Full-course access ends within 14 days
    expect(res.body.coursesEndingSoon).toHaveLength(1);
  });

  it('syllabus: per-lecture progress, counts, timers and an access summary', async () => {
    const res = await request(app.getHttpServer()).get(`/progress/course/${ids.course}/syllabus`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.access).toMatchObject({ hasFullCourse: true, courseExpired: false, isFree: false });
    const byId = new Map(res.body.chapters[0].lectures.map((l: any) => [l.id, l]));
    expect(byId.get(ids.recent)).toMatchObject({
      progress: { done: 1, total: 2 },
      counts: { videos: 2, quizzes: 0, files: 1 },
      durationSec: 1500,
      isUnlocked: true,
    });
    expect((byId.get(ids.recent) as any).accessEndsAt).toBeTruthy();
    expect(byId.get(ids.done)).toMatchObject({ progress: { done: 2, total: 2 } });
    expect(byId.get(ids.expired)).toMatchObject({ isExpired: true, isUnlocked: false });
    expect(byId.get(ids.locked)).toMatchObject({ isUnlocked: false, requiresOwnCode: true });
  });

  it('only students can call the new endpoint', async () => {
    await request(app.getHttpServer()).get('/progress/continue').expect(401);
  });
});
