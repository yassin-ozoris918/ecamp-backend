import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ecamp.com' },
    update: {
      password: adminPassword,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      fullName: 'E.Camp Master Admin',
      email: 'admin@ecamp.com',
      password: adminPassword,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log('Admin account seeded/updated successfully:', admin.email);
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
