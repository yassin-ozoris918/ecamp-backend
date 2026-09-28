const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const unis = await prisma.academicUniversity.findMany({
    where: { OR: [{ nameEn: { contains: 'Suez Canal', mode: 'insensitive' } }, { nameEn: { contains: 'New Ismailia', mode: 'insensitive' } }] },
    include: {
      faculties: {
        where: { nameEn: { contains: 'Engineering', mode: 'insensitive' } },
        include: {
          departments: { include: { programs: true } },
          programs: true
        }
      }
    }
  });
  console.log(JSON.stringify(unis, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
