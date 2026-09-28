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
    select: { id: true }
  });

  if (universityWithHighSchool.length > 0) {
    console.log(`Cleaning up ${universityWithHighSchool.length} UNIVERSITY users...`);
    await prisma.user.updateMany({
      where: {
        id: { in: universityWithHighSchool.map(u => u.id) }
      },
      data: {
        highSchoolSystem: null,
        studyMode: null,
        studyLanguage: null,
        highSchoolGrade: null,
        traditionalBranch: null,
        baccalaureatePath: null,
        parentPhoneNumber: null,
      }
    });
  }

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
    select: { id: true }
  });

  if (highSchoolWithUniversity.length > 0) {
    console.log(`Cleaning up ${highSchoolWithUniversity.length} HIGH_SCHOOL users...`);
    await prisma.user.updateMany({
      where: {
        id: { in: highSchoolWithUniversity.map(u => u.id) }
      },
      data: {
        universityId: null,
        facultyId: null,
        departmentId: null,
        programId: null,
        otherUniversityName: null,
        otherFacultyName: null,
        otherDepartmentName: null,
        otherProgramName: null,
      }
    });
  }

  console.log('Cleanup finished.');
}

run().catch(console.error).finally(() => prisma.$disconnect());
