const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const uniId = '7304dd8b-c1c3-4341-b306-bc2f7a42586b';
  const facId = '1e12a682-771e-4942-850c-83fc80015498';

  const dept = await prisma.academicDepartment.findFirst({
    where: { facultyId: facId, nameAr: 'لا يوجد تخصص حاليا' }
  });

  if (!dept) {
    await prisma.academicDepartment.create({
      data: {
        universityId: uniId,
        facultyId: facId,
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
