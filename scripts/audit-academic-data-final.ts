import { PrismaClient, EducationLevel } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const universityWithHighSchool = await prisma.user.findMany({
    where: {
      educationLevel: EducationLevel.UNIVERSITY,
      OR: [
        { highSchoolSystem: { not: null } },
        { studyMode: { not: null } },
        { studyLanguage: { not: null } },
        { highSchoolGrade: { not: null } },
        { traditionalBranch: { not: null } },
        { baccalaureatePath: { not: null } },
        { parentPhoneNumber: { not: null } },
      ],
    },
  });

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

  console.log(`UNIVERSITY users with HIGH_SCHOOL-only data: ${universityWithHighSchool.length}`);
  console.log(`HIGH_SCHOOL users with UNIVERSITY-only data: ${highSchoolWithUniversity.length}`);
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
