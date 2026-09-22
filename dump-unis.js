const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const count = await p.academicUniversity.count();
  console.log('University count:', count);

  const sample = await p.academicUniversity.findMany({
    take: 5,
    select: { id: true, nameEn: true, nameAr: true, isOther: true, sortOrder: true }
  });
  console.log(JSON.stringify(sample, null, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
