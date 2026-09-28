const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const pending = await prisma.user.findMany({where:{isActive:false}, select:{email:true, educationLevel:true, createdAt:true}});
  console.log("Pending Users:", pending);
  const recent = await prisma.user.findMany({
    where: { createdAt: { gte: new Date('2026-09-01') } },
    select: { email: true, educationLevel: true, createdAt: true, isActive: true }
  });
  console.log("Recent Users:", recent);
}
main().finally(()=>prisma.$disconnect());
