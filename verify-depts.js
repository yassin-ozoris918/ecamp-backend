const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const scu = await p.academicUniversity.findFirst({
    where: { nameEn: 'Suez Canal University' },
    include: {
      faculties: {
        include: { departments: true }
      }
    }
  });

  console.log('--- SCU Faculties ---');
  console.log(scu.faculties.map(f => f.nameEn));

  const med = scu.faculties.find(f => f.nameEn === 'Faculty of Medicine');
  console.log('\n--- SCU Med Depts ---');
  console.log(med.departments.map(d => d.nameEn));
  
  const eng = scu.faculties.find(f => f.nameEn === 'Faculty of Engineering');
  console.log('\n--- SCU Eng Depts ---');
  console.log(eng.departments.map(d => d.nameEn));
}

main().catch(console.error).finally(() => p.$disconnect());
