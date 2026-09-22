import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const oldNames = [
    'جامعة قناة السويس',
    'جامعة الإسماعيلية الجديدة الأهلية',
    'جامعة الزقازيق',
    'جامعة الزقازيق الأهلية'
  ];

  for (const nameAr of oldNames) {
    const uni = await prisma.academicUniversity.findFirst({ where: { nameAr } });
    if (uni) {
      console.log(`Deleting old duplicate tree for: ${nameAr}...`);
      
      // Delete programs that belong to departments in this university
      await prisma.academicProgram.deleteMany({
        where: { department: { universityId: uni.id } }
      });
      
      // Delete programs directly under faculties in this university
      await prisma.academicProgram.deleteMany({
        where: { faculty: { universityId: uni.id } }
      });

      // Delete departments
      await prisma.academicDepartment.deleteMany({
        where: { universityId: uni.id }
      });

      // Delete faculties
      await prisma.academicFaculty.deleteMany({
        where: { universityId: uni.id }
      });

      // Delete university
      await prisma.academicUniversity.delete({
        where: { id: uni.id }
      });
      
      console.log(`Successfully deleted ${nameAr}.`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
