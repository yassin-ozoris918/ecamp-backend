import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Deactivating all existing academic data...');

  // Set isActive = false on all programs, departments, faculties, universities
  // The seed script will subsequently set isActive = true for the active ones.
  await prisma.academicProgram.updateMany({
    data: { isActive: false },
  });
  
  await prisma.academicDepartment.updateMany({
    data: { isActive: false },
  });

  await prisma.academicFaculty.updateMany({
    data: { isActive: false },
  });

  await prisma.academicUniversity.updateMany({
    data: { isActive: false },
  });

  console.log('All existing academic data has been marked as inactive.');
  console.log('Please run the seed script next to activate the allowed entities.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
