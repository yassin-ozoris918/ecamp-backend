import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStudentRecords() {
  const oldEmail = 'yma1972009@gmial.com';
  
  const oldUsers = await prisma.user.findMany({
    where: { email: { contains: oldEmail } },
    include: {
      accessedLectures: true,
      redeemedCodes: true
    }
  });

  const newEmail = 'yma1812@gmial.com';
  const newUsers = await prisma.user.findMany({
    where: { email: { contains: newEmail } },
    include: {
      accessedLectures: true,
      redeemedCodes: true
    }
  });

  console.log('--- OLD ACCOUNTS ---');
  oldUsers.forEach(u => {
    console.log(`ID: ${u.id}, Email: ${u.email}, Created: ${u.createdAt}, Deleted: ${u.deletedAt}`);
    console.log(`Redeemed Codes:`, u.redeemedCodes.map(c => ({ code: c.code, redeemedAt: c.redeemedAt })));
    console.log(`Accessed Lectures:`, u.accessedLectures.map(l => ({ lectureId: l.lectureId, activatedAt: l.activatedAt })));
  });

  console.log('\n--- NEW ACCOUNTS ---');
  newUsers.forEach(u => {
    console.log(`ID: ${u.id}, Email: ${u.email}, Created: ${u.createdAt}, Deleted: ${u.deletedAt}`);
    console.log(`Redeemed Codes:`, u.redeemedCodes.map(c => ({ code: c.code, redeemedAt: c.redeemedAt })));
    console.log(`Accessed Lectures:`, u.accessedLectures.map(l => ({ lectureId: l.lectureId, activatedAt: l.activatedAt })));
  });
}

checkStudentRecords()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
