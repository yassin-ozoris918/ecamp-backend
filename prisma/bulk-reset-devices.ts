import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('==================================================');
  console.log('🔄 Starting Bulk Device Reset for All Students...');
  console.log('==================================================\n');

  // 1. Fetch all students who currently have a bound device
  const students = await prisma.user.findMany({
    where: {
      role: Role.STUDENT,
      deviceId: { not: null },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      deviceId: true,
    },
  });

  if (students.length === 0) {
    console.log('ℹ️  No students have bound devices to reset. All student accounts are already clear.');
    return;
  }

  console.log(`Found ${students.length} student(s) with bound devices. Processing reset...`);

  // 2. Clear deviceId for all students
  const updateResult = await prisma.user.updateMany({
    where: {
      role: Role.STUDENT,
      deviceId: { not: null },
    },
    data: {
      deviceId: null,
    },
  });

  // 3. Log RESET audit event in DeviceHistory for security and compliance
  try {
    const historyEntries = students
      .filter((s) => Boolean(s.deviceId))
      .map((s) => ({
        studentId: s.id,
        deviceFingerprint: s.deviceId as string,
        action: 'RESET',
        browser: 'BULK_ADMIN_RESET',
        ipAddress: 'SERVER_SCRIPT',
      }));

    if (historyEntries.length > 0) {
      await prisma.deviceHistory.createMany({
        data: historyEntries,
      });
      console.log(`📝 Logged RESET action for ${historyEntries.length} device history records.`);
    }
  } catch (logErr) {
    console.warn('⚠️ Warning: Failed to record audit log in DeviceHistory, but devices were reset successfully:', logErr);
  }

  console.log('\n==================================================');
  console.log(`✅ Success! Successfully reset devices for ${updateResult.count} student(s).`);
  console.log('💡 Note: Next time each student logs in:');
  console.log('   - Their current device will be bound as their primary authorized device.');
  console.log('   - Their exact OS, browser, and device model will be recorded automatically.');
  console.log('==================================================');
}

main()
  .catch((e) => {
    console.error('❌ Bulk reset failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
