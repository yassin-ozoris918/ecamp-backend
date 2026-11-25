import { StudentNotificationsService } from './student-notifications.service';

describe('StudentNotificationsService', () => {
  function setup() {
    const prisma: any = {
      notification: {
        count: jest.fn().mockResolvedValue(4),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lecture: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, svc: new StudentNotificationsService(prisma) };
  }

  it('every query is scoped to the calling student', async () => {
    const { prisma, svc } = setup();
    prisma.notification.findMany.mockResolvedValue([]);
    await svc.list('me', {});
    await svc.markRead('me', 'n1');
    await svc.markAllRead('me');
    expect(prisma.notification.findMany.mock.calls[0][0].where.userId).toBe('me');
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'me', readAt: null });
    expect(prisma.notification.updateMany.mock.calls[1][0].where).toEqual({ userId: 'me', readAt: null });
  });

  it('paginates with a cursor and clamps the page size', async () => {
    const { prisma, svc } = setup();
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: `n${i}`, createdAt: new Date() }));
    prisma.notification.findMany.mockResolvedValue(rows);
    const res = await svc.list('me', { limit: 500 });
    expect(prisma.notification.findMany.mock.calls[0][0].take).toBe(51); // max 50 + 1 look-ahead
    expect(res.items).toHaveLength(50);
    expect(res.nextCursor).toBe('n49');
    expect(res.unreadCount).toBe(4);
  });

  it("ignores a cursor that belongs to someone else", async () => {
    const { prisma, svc } = setup();
    prisma.notification.findFirst.mockResolvedValue(null);
    prisma.notification.findMany.mockResolvedValue([]);
    await svc.list('me', { cursor: 'someone-elses' });
    expect(prisma.notification.findFirst.mock.calls[0][0].where).toEqual({ id: 'someone-elses', userId: 'me' });
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'me' });
  });

  it('shows the current chapter / lecture / course names (after renames or moves)', async () => {
    const { prisma, svc } = setup();
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n1', lectureId: 'L1', params: { courseTitle: 'Old course', lectureTitle: 'Old lecture', itemTitle: 'Part 1', count: 1 } },
      { id: 'n2', lectureId: 'GONE', params: { courseTitle: 'Saved', lectureTitle: 'Saved lecture', itemTitle: 'x', count: 1 } },
    ]);
    prisma.lecture.findMany.mockResolvedValue([
      { id: 'L1', title: 'Lecture 1', chapter: { title: 'Chapter 3 [ Fluids ]' }, course: { title: 'Physics 1' } },
    ]);
    const res = await svc.list('me', {});
    expect(res.items[0].params).toEqual({
      courseTitle: 'Physics 1',
      chapterTitle: 'Chapter 3 [ Fluids ]',
      lectureTitle: 'Lecture 1',
      itemTitle: 'Part 1',
      count: 1,
    });
    // Deleted lecture: keep what was saved
    expect(res.items[1].params).toMatchObject({ courseTitle: 'Saved', lectureTitle: 'Saved lecture' });
  });
});
