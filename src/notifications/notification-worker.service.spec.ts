import { NotificationWorkerService } from './notification-worker.service';
import { enqueueSessionVideoNotification, enqueueLectureMaterialNotification } from './content-notification-outbox';

const lectureCtx = (over: any = {}) => ({
  id: 'L1',
  title: 'Lecture 1',
  deletedAt: null,
  chapter: { title: 'Chapter 3 [ Fluids ]' },
  course: {
    id: 'C1',
    title: 'Anatomy',
    type: 'NORMAL',
    status: 'PUBLISHED',
    isFree: false,
    deletedAt: null,
    audienceType: 'UNIVERSITY',
    targetGroups: [],
    ...over,
  },
});

const event = (over: any = {}) => ({
  id: 'e1',
  type: 'SESSION_ADDED',
  dedupeKey: 'VIDEO:s1',
  groupKey: 'VIDEO:L1',
  courseId: 'C1',
  lectureId: 'L1',
  targetId: 's1',
  itemTitle: 'Part 1',
  status: 'PROCESSING',
  attempts: 1,
  lastError: null,
  scheduledFor: new Date(),
  lockedAt: new Date(),
  processedAt: null,
  recipientCount: 0,
  createdAt: new Date('2026-11-23T10:00:00Z'),
  ...over,
});

function setup() {
  const prisma: any = {
    session: { findMany: jest.fn() },
    attachment: { findMany: jest.fn() },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const recipients: any = {
    loadLectureContext: jest.fn().mockResolvedValue(lectureCtx()),
    resolve: jest.fn().mockResolvedValue(new Map([['u1', '/lecture/L1'], ['u2', '/files']])),
  };
  const worker = new NotificationWorkerService(prisma, recipients);
  return { prisma, recipients, worker };
}

describe('NotificationWorkerService.processGroup', () => {
  it('merges a burst into ONE notification per student with the right count', async () => {
    const { prisma, worker } = setup();
    prisma.session.findMany.mockResolvedValue([
      { id: 's1', title: 'Part 1' },
      { id: 's2', title: 'Part 2' },
    ]);
    const out = await worker.processGroup([event(), event({ id: 'e2', targetId: 's2', dedupeKey: 'VIDEO:s2' })] as any);

    expect(out).toEqual({ recipients: 2 });
    const rows = prisma.notification.createMany.mock.calls[0][0];
    expect(rows.skipDuplicates).toBe(true);
    expect(rows.data).toHaveLength(2);
    expect(rows.data[0]).toMatchObject({
      eventId: 'e1',
      type: 'SESSION_ADDED',
      params: { count: 2, courseTitle: 'Anatomy', chapterTitle: 'Chapter 3 [ Fluids ]', lectureTitle: 'Lecture 1' },
    });
  });

  it('a burst that contains the first video of the lecture is announced as a NEW LECTURE', async () => {
    const { prisma, worker } = setup();
    prisma.session.findMany.mockResolvedValue([{ id: 's1', title: 'Part 1' }, { id: 's2', title: 'Part 2' }]);
    await worker.processGroup([event({ type: 'LECTURE_ADDED' }), event({ id: 'e2', targetId: 's2' })] as any);
    expect(prisma.notification.createMany.mock.calls[0][0].data[0].type).toBe('LECTURE_ADDED');
  });

  it('sends nothing when the content was deleted before delivery', async () => {
    const { prisma, recipients, worker } = setup();
    prisma.session.findMany.mockResolvedValue([]);
    const out = await worker.processGroup([event()] as any);
    expect(out.recipients).toBe(0);
    expect(recipients.resolve).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('sends nothing while the course is a draft or deleted', async () => {
    const { prisma, recipients, worker } = setup();
    recipients.loadLectureContext.mockResolvedValueOnce(lectureCtx({ status: 'DRAFT' }));
    expect((await worker.processGroup([event()] as any)).recipients).toBe(0);
    recipients.loadLectureContext.mockResolvedValueOnce(null);
    expect((await worker.processGroup([event()] as any)).recipients).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('material groups use MATERIAL_ADDED and the per-student link', async () => {
    const { prisma, worker } = setup();
    prisma.attachment.findMany.mockResolvedValue([{ id: 'a1', title: 'Handout.pdf' }]);
    await worker.processGroup([event({ type: 'MATERIAL_ADDED', groupKey: 'MATERIAL:L1', targetId: 'a1' })] as any);
    const data = prisma.notification.createMany.mock.calls[0][0].data;
    expect(data.map((d: any) => [d.userId, d.type, d.link])).toEqual([
      ['u1', 'MATERIAL_ADDED', '/lecture/L1'],
      ['u2', 'MATERIAL_ADDED', '/files'],
    ]);
    expect(data[0].params.itemTitle).toBe('Handout.pdf');
  });
});

describe('outbox writers', () => {
  function tx(over: any = {}) {
    return {
      session: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1', title: 'Part 1', videoUrl: 'https://v', deletedAt: null, lectureId: 'L1', lecture: { courseId: 'C1' } }),
        count: jest.fn().mockResolvedValue(0),
      },
      attachment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', title: 'Notes', deletedAt: null, lectureId: 'L1', lecture: { courseId: 'C1' } }),
      },
      notificationEvent: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ...over,
    };
  }

  it('first video of a lecture → LECTURE_ADDED, idempotent insert, debounce slid', async () => {
    const t = tx();
    await enqueueSessionVideoNotification(t, 's1');
    const arg = t.notificationEvent.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0]).toMatchObject({ type: 'LECTURE_ADDED', dedupeKey: 'VIDEO:s1', groupKey: 'VIDEO:L1' });
    expect(t.notificationEvent.updateMany).toHaveBeenCalled();
  });

  it('lecture that already has videos → SESSION_ADDED', async () => {
    const t = tx();
    t.session.count.mockResolvedValue(3);
    await enqueueSessionVideoNotification(t, 's1');
    expect(t.notificationEvent.createMany.mock.calls[0][0].data[0].type).toBe('SESSION_ADDED');
  });

  it('a session without a video is not announced', async () => {
    const t = tx();
    t.session.findFirst.mockResolvedValue({ id: 's1', videoUrl: null, deletedAt: null, lectureId: 'L1', lecture: { courseId: 'C1' } });
    await enqueueSessionVideoNotification(t, 's1');
    expect(t.notificationEvent.createMany).not.toHaveBeenCalled();
  });

  it('a new lecture file → MATERIAL_ADDED', async () => {
    const t = tx();
    await enqueueLectureMaterialNotification(t, 'a1');
    expect(t.notificationEvent.createMany.mock.calls[0][0].data[0]).toMatchObject({ type: 'MATERIAL_ADDED', dedupeKey: 'MATERIAL:a1', groupKey: 'MATERIAL:L1' });
  });
});
