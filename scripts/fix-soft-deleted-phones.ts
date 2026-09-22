import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing phone numbers for soft-deleted accounts...");

  // Find all users who are soft-deleted and have a phone number
  const deletedUsers = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      phoneNumber: { not: null },
      NOT: { phoneNumber: "" }
    }
  });

  let fixedCount = 0;
  for (const user of deletedUsers) {
    // If the phone number hasn't been modified with '_deleted_' yet
    if (!user.phoneNumber?.includes('_deleted_')) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneNumber: `${user.phoneNumber}_deleted_${user.deletedAt?.getTime() || Date.now()}`
        }
      });
      fixedCount++;
    }
  }

  // Also check if there are users with '_deleted_' in their email but deletedAt is somehow null (fallback check)
  const emailDeletedUsers = await prisma.user.findMany({
    where: {
      email: { contains: '_deleted_' },
      phoneNumber: { not: null },
      NOT: [
        { phoneNumber: "" },
        { phoneNumber: { contains: '_deleted_' } }
      ]
    }
  });

  for (const user of emailDeletedUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneNumber: `${user.phoneNumber}_deleted_${Date.now()}`
      }
    });
    fixedCount++;
  }

  console.log(`✅ Fixed ${fixedCount} soft-deleted accounts by appending '_deleted_' to their phone numbers to free them up.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
