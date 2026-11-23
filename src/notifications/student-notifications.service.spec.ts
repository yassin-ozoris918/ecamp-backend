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
});
