import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const uniName = 'جامعة الإسماعيلية الجديدة الأهلية (NINU)';
  
  const uni = await prisma.academicUniversity.findFirst({
    where: { nameAr: uniName }
  });

  if (!uni) {
    console.log(`Could not find ${uniName}`);
    return;
  }

  // Delete all faculties belonging to NINU EXCEPT 'كلية الهندسة'
  const facultiesToDelete = await prisma.academicFaculty.findMany({
    where: {
      universityId: uni.id,
      nameAr: {
        not: 'كلية الهندسة'
      }
    }
  });

  if (facultiesToDelete.length === 0) {
    console.log('No extra faculties found to delete.');
    return;
  }

  console.log(`Found ${facultiesToDelete.length} extra faculties to delete...`);

  for (const faculty of facultiesToDelete) {
    console.log(`Deleting ${faculty.nameAr}...`);
    // Delete programs just in case
    await prisma.academicProgram.deleteMany({
      where: { facultyId: faculty.id }
    });
    // Delete departments just in case
    await prisma.academicDepartment.deleteMany({
      where: { facultyId: faculty.id }
    });
    // Delete the faculty
    await prisma.academicFaculty.delete({
      where: { id: faculty.id }
    });
    console.log(`Deleted ${faculty.nameAr}`);
  }

  console.log('Done cleaning up extra faculties!');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
