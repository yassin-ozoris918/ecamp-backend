import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const email = "ahmedeshmawy0667@gmail.com";
  
  const userByEmail = await prisma.user.findMany({
    where: { email: { contains: email } }
  });

  console.log('--- Users with this email ---');
  console.dir(userByEmail, { depth: null });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
