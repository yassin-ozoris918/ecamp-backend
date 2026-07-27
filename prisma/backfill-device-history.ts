import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill of DeviceHistory...');

  const sessions = await prisma.deviceSession.findMany({
    where: { deletedAt: null },
    include: {
      student: { select: { fullName: true, deviceId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${sessions.length} active device sessions.`);

  let created = 0;
  let skipped = 0;

  for (const session of sessions) {
    const existing = await prisma.deviceHistory.findFirst({
      where: {
        studentId: session.studentId,
        deviceFingerprint: session.deviceFingerprint,
        action: 'REGISTERED',
      },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.deviceHistory.create({
      data: {
        studentId: session.studentId,
        deviceFingerprint: session.deviceFingerprint,
        action: 'REGISTERED',
        ipAddress: session.ipAddress,
        browser: session.browser,
        createdAt: session.createdAt,
      },
    });
    created++;
  }

  console.log(`Backfill complete: ${created} records created, ${skipped} skipped (already exist).`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
