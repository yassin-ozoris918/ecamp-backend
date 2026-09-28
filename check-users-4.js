const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { 
      email: { not: { contains: 'test.com' } }
    },
    select: { email: true, educationLevel: true, createdAt: true, isActive: true }
  });
  console.log("Real Users:", users);
}
main().finally(()=>prisma.$disconnect());
