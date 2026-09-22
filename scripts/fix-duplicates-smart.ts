import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const mappings = [
    { oldAr: 'جامعة قناة السويس', newAr: 'جامعة قناة السويس (SCU)', newEn: 'Suez Canal University (SCU)' },
    { oldAr: 'جامعة الإسماعيلية الجديدة الأهلية', newAr: 'جامعة الإسماعيلية الجديدة الأهلية (NINU)', newEn: 'New Ismailia National University (NINU)' },
    { oldAr: 'جامعة الزقازيق', newAr: 'جامعة الزقازيق (ZU)', newEn: 'Zagazig University (ZU)' },
    { oldAr: 'جامعة الزقازيق الأهلية', newAr: 'جامعة الزقازيق الأهلية (ZNU)', newEn: 'Zagazig National University (ZNU)' }
  ];

  for (const { oldAr, newAr, newEn } of mappings) {
    const oldUni = await prisma.academicUniversity.findFirst({ where: { nameAr: oldAr } });
    const newUni = await prisma.academicUniversity.findFirst({ where: { nameAr: newAr } });

    if (newUni && oldUni && newUni.id !== oldUni.id) {
      console.log(`Deleting newly created empty duplicate tree for: ${newAr}...`);
      
      // Delete programs that belong to departments in this new university
      await prisma.academicProgram.deleteMany({
        where: { department: { universityId: newUni.id } }
      });
      
      // Delete programs directly under faculties in this new university
      await prisma.academicProgram.deleteMany({
        where: { faculty: { universityId: newUni.id } }
      });

      // Delete departments
      await prisma.academicDepartment.deleteMany({
        where: { universityId: newUni.id }
      });

      // Delete faculties
      await prisma.academicFaculty.deleteMany({
        where: { universityId: newUni.id }
      });

      // Delete university
      await prisma.academicUniversity.delete({
        where: { id: newUni.id }
      });
      
      console.log(`Deleted empty new tree. Now updating old tree to new names...`);
      await prisma.academicUniversity.update({
        where: { id: oldUni.id },
        data: { nameAr: newAr, nameEn: newEn }
      });
      console.log(`Updated ${oldAr} to ${newAr}.`);
    } else if (oldUni && !newUni) {
        console.log(`No duplicate found for ${oldAr}. Updating name directly...`);
        await prisma.academicUniversity.update({
            where: { id: oldUni.id },
            data: { nameAr: newAr, nameEn: newEn }
        });
        console.log(`Updated ${oldAr} to ${newAr}.`);
    } else if (!oldUni) {
        console.log(`Old tree for ${oldAr} not found, it must have already been successfully renamed or deleted.`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
