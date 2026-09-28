import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const number = "01033518365";
  
  const userByPhone = await prisma.user.findMany({
    where: { phoneNumber: number }
  });
  
  const userByParentPhone = await prisma.user.findMany({
    where: { parentPhoneNumber: number }
  });

  console.log('--- Users with this phoneNumber ---');
  console.dir(userByPhone, { depth: null });
  
  console.log('--- Users with this parentPhoneNumber ---');
  console.dir(userByParentPhone, { depth: null });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
