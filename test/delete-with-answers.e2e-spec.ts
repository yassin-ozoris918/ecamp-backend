/**
 * E2E: deleting a course / lecture / quiz that students have already answered works and removes the
 * answers with it, while replacing answered questions is still refused (answers never lost silently).
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

describe('Delete content that students answered (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const tag = `del-${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  /** A lecture with a quiz (one answered question) and a lecture exam (one answered essay). */
  const answeredLecture = async (courseId: string, title: string) => {
    const lecture = await prisma.lecture.create({ data: { courseId, title, orderIndex: 0 } });
    const quiz = await prisma.quiz.create({ data: { lectureId: lecture.id, title: `Quiz ${title}` } });
    const qq = await prisma.quizQuestion.create({ data: { quizId: quiz.id, text: 'Pick', options: ['a', 'b'], correctOptionIndex: 0 } });
    const qa = await prisma.quizAttempt.create({ data: { studentId: ids.student, quizId: quiz.id, status: 'PENDING', submittedAt: new Date() } });
    await prisma.quizAttemptResponse.create({ data: { attemptId: qa.id, questionId: qq.id, selectedOptionIndex: 1 } });
    const exam = await prisma.exam.create({ data: { title: `Exam ${title}`, lectureId: lecture.id } });
    const eq = await prisma.examQuestion.create({ data: { examId: exam.id, text: 'Explain', type: 'ESSAY', points: 5 } });
    const ea = await prisma.examAttempt.create({ data: { studentId: ids.student, examId: exam.id, status: 'PENDING', submittedAt: new Date() } });
    await prisma.studentExamResponse.create({ data: { attemptId: ea.id, questionId: eq.id, textResponse: 'My essay' } });
    return { lecture, quiz, qq, exam, eq };
  };

  const answersFor = async (questionIds: string[]) =>
    (await prisma.quizAttemptResponse.count({ where: { questionId: { in: questionIds } } })) +
    (await prisma.studentExamResponse.count({ where: { questionId: { in: questionIds } } }));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    for (const [key, role] of [['admin', Role.ADMIN], ['student', Role.STUDENT]] as const) {
      const u = await prisma.user.create({ data: { fullName: key, email: `${key}-${tag}@t.test`, password: 'x', role } });
      ids[key] = u.id;
      tokens[key] = jwt.sign({ sub: u.id, email: u.email, role }, { secret: process.env.JWT_ACCESS_SECRET || 'test_secret' });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.course.deleteMany({ where: { title: { endsWith: tag } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@t.test` } } });
    }
    await app?.close();
  });

  it('deletes a whole course with answered course exam, lecture quiz and lecture exam', async () => {
    const course = await prisma.course.create({ data: { title: `Course ${tag}` } });
    const finalExam = await prisma.exam.create({ data: { title: 'Final', courseId: course.id } });
    const essay = await prisma.examQuestion.create({ data: { examId: finalExam.id, text: 'Discuss', type: 'ESSAY', points: 10 } });
    const attempt = await prisma.examAttempt.create({ data: { studentId: ids.student, examId: finalExam.id, status: 'PENDING', submittedAt: new Date() } });
    await prisma.studentExamResponse.create({ data: { attemptId: attempt.id, questionId: essay.id, textResponse: 'Long answer' } });
    const l = await answeredLecture(course.id, `L1 ${tag}`);
    const qIds = [essay.id, l.qq.id, l.eq.id];
    expect(await answersFor(qIds)).toBe(3);

    await http().delete(`/courses/${course.id}`).set(as('admin')).expect(200);

    expect(await prisma.course.count({ where: { id: course.id } })).toBe(0);
    expect(await answersFor(qIds)).toBe(0);
    expect(await prisma.examAttempt.count({ where: { id: attempt.id } })).toBe(0);
  });

  it('deletes a lecture whose quiz and exam were answered', async () => {
    const course = await prisma.course.create({ data: { title: `Course2 ${tag}` } });
    const l = await answeredLecture(course.id, `L2 ${tag}`);

    await http().delete(`/lectures/${l.lecture.id}`).set(as('admin')).expect(200);

    expect(await prisma.lecture.count({ where: { id: l.lecture.id } })).toBe(0);
    expect(await answersFor([l.qq.id, l.eq.id])).toBe(0);
  });

  it('deletes an answered quiz', async () => {
    const course = await prisma.course.create({ data: { title: `Course3 ${tag}` } });
    const l = await answeredLecture(course.id, `L3 ${tag}`);

    await http().delete(`/quizzes/${l.quiz.id}`).set(as('admin')).expect(200);

    expect(await prisma.quiz.count({ where: { id: l.quiz.id } })).toBe(0);
    expect(await answersFor([l.qq.id])).toBe(0);
    expect(await answersFor([l.eq.id])).toBe(1); // the lecture's exam is untouched
  });

  it('still refuses to replace answered quiz/exam questions, keeping the answers', async () => {
    const course = await prisma.course.create({ data: { title: `Course4 ${tag}` } });
    const l = await answeredLecture(course.id, `L4 ${tag}`);
    const replacement = { questions: [{ text: 'New', options: ['x', 'y'], correctOptionIndex: 0 }] };

    const quizRes = await http().put(`/admin/quizzes/${l.quiz.id}/questions/batch`).set(as('admin')).send(replacement).expect(400);
    expect(quizRes.body.message).toBe('quiz.messages.cannotModifyUsed');
    const examRes = await http().put(`/exams/${l.exam.id}/questions/batch`).set(as('admin')).send(replacement).expect(400);
    expect(examRes.body.message).toBe('quiz.messages.cannotModifyUsed');
    await http().delete(`/admin/quizzes/questions/${l.qq.id}`).set(as('admin')).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));

    expect(await answersFor([l.qq.id, l.eq.id])).toBe(2);
  });
});
