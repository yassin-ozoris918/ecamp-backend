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
    select: {
      id: true,
      email: true,
      highSchoolSystem: true,
      studyMode: true,
      parentPhoneNumber: true,
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
    select: {
      id: true,
      email: true,
      universityId: true,
      facultyId: true,
    },
  });

  console.log(`[AUDIT] UNIVERSITY users with non-null high-school fields: ${universityWithHighSchool.length}`);
  if (universityWithHighSchool.length > 0) {
      console.log('Sample affected fields: ', universityWithHighSchool[0]);
  }

  console.log(`[AUDIT] HIGH_SCHOOL users with non-null university fields: ${highSchoolWithUniversity.length}`);
  if (highSchoolWithUniversity.length > 0) {
      console.log('Sample affected fields: ', highSchoolWithUniversity[0]);
  }
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
