import { PrismaClient, EducationLevel } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const highSchoolWithUniversity = await prisma.user.findMany({
    where: {
      educationLevel: EducationLevel.HIGH_SCHOOL,
      OR: [
        { universityId: { not: null } },
        { facultyId: { not: null } },
        { departmentId: { not: null } },
        { programId: { not: null } },
        { otherUniversityName: { not: null } },
        { otherFacultyName: { not: null } },
        { otherDepartmentName: { not: null } },
        { otherProgramName: { not: null } },
      ],
    },
  });

  if (highSchoolWithUniversity.length > 0) {
      console.log('Sample affected fields: ', highSchoolWithUniversity[0]);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
