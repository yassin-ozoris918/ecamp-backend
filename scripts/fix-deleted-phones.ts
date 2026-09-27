import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const deletedUsers = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      phoneNumber: { not: null },
    },
  });

  let count = 0;
  for (const user of deletedUsers) {
    if (user.phoneNumber && !user.phoneNumber.includes('_del_') && !user.phoneNumber.includes('_deleted_')) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneNumber: `${user.phoneNumber}_del_${Date.now()}`
        }
      });
      count++;
    }
  }

  console.log(`Updated ${count} soft-deleted users to release their phone numbers.`);
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
