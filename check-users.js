const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'STUDENT', educationLevel: 'UNIVERSITY' },
    select: { id: true, email: true, createdAt: true, universityId: true }
  });
  console.log('University Students count:', users.length);
  if(users.length > 0) {
    console.log(users[0]);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
