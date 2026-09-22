const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const uni = await prisma.academicUniversity.findFirst({
    where: { id: 'c77d8f3f-dad0-4418-84da-ab39bd0eb4af' }
  });
  console.log('University:', uni);

  if (uni) {
    const faculties = await prisma.academicFaculty.count({ where: { universityId: uni.id } });
    console.log('Faculties:', faculties);
    
    // Check total departments
    const facs = await prisma.academicFaculty.findMany({ where: { universityId: uni.id } });
    let depsCount = 0;
    let progsCount = 0;
    for (const f of facs) {
      depsCount += await prisma.academicDepartment.count({ where: { facultyId: f.id } });
      progsCount += await prisma.academicProgram.count({ where: { facultyId: f.id } });
    }
    console.log('Departments:', depsCount);
    console.log('Programs:', progsCount);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
