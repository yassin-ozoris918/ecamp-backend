const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const uni = await prisma.academicUniversity.findFirst({
    where: { nameEn: 'Suez Canal University (SCU)' }
  });
  if (!uni) return console.log('Uni not found');

  const fac = await prisma.academicFaculty.findFirst({
    where: { universityId: uni.id, nameEn: 'Faculty of Computers and Information' }
  });
  if (!fac) return console.log('Fac not found');

  const dept = await prisma.academicDepartment.findFirst({
    where: { facultyId: fac.id, nameAr: 'لا يوجد تخصص حاليا' }
  });

  if (!dept) {
    await prisma.academicDepartment.create({
      data: {
        universityId: uni.id,
        facultyId: fac.id,
        nameAr: 'لا يوجد تخصص حاليا',
        nameEn: 'No Specialization Currently',
        sortOrder: 4,
        isOther: false,
        isActive: true
      }
    });
    console.log('Department added successfully!');
  } else {
    console.log('Department already exists!');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
