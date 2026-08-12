import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function restoreUser() {
  const users = await prisma.user.findMany({
    where: { 
      fullName: { contains: 'يوسف محمد' }
    }
  });

  if (users.length === 0) {
    console.log('User not found by name');
    return;
  }

  console.log('Found users:', users.map(u => ({ id: u.id, email: u.email, deletedAt: u.deletedAt })));

  for (const user of users) {
    if (user.deletedAt || user.email.includes('_deleted_')) {
      const newEmail = user.email.split('_deleted_')[0];

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: newEmail,
          deletedAt: null
        }
      });

      console.log('User restored successfully:', updatedUser.email);
    }
  }
}

restoreUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
