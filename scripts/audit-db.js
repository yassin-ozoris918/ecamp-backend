const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const unis = await prisma.academicUniversity.findMany({ include: { faculties: { include: { departments: { include: { programs: true } } } } } });
  console.log(JSON.stringify(unis, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
