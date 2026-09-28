import { PrismaClient, Role, EducationLevel } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestUser(email: string, universityId: string, facultyId: string, departmentId: string, programId: string | null) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing.id;
  
  const user = await prisma.user.create({
    data: {
      email,
      fullName: `Test ${email}`,
      password: 'password',
      role: Role.STUDENT,
      educationLevel: EducationLevel.UNIVERSITY,
      universityId,
      facultyId,
      departmentId,
      programId
    }
  });
  return user;
}

async function getCoursesForStudent(user: any) {
  const condition = [
    { OR: [{ targetUniversityId: null }, { targetUniversityId: user.universityId }] },
    { OR: [{ targetFacultyId: null }, { targetFacultyId: user.facultyId }] },
    { OR: [{ targetDepartmentId: null }, { targetDepartmentId: user.departmentId }] },
    { OR: [{ targetProgramId: null }, { targetProgramId: user.programId }] },
  ];

  return prisma.course.findMany({
    where: {
      status: 'PUBLISHED',
      AND: [
        { audienceType: user.educationLevel },
        {
          OR: [
            {
              AND: [
                { targetGroups: { none: {} } },
                { AND: condition }
              ]
            },
            { targetGroups: { some: { AND: condition } } }
          ]
        }
      ]
    }
  });
}

async function runTests() {
  console.log('--- STARTING TARGET GROUPS TEST ---');

  const scuEng = await prisma.academicFaculty.findFirst({
    where: { university: { nameEn: { contains: 'Suez Canal' } }, nameEn: { contains: 'Engineering' } },
    include: { departments: { include: { programs: true } } }
  });
  
  const ninuEng = await prisma.academicFaculty.findFirst({
    where: { university: { nameEn: { contains: 'New Ismailia' } }, nameEn: { contains: 'Engineering' } },
    include: { departments: { include: { programs: true } } }
  });

  const scuMed = await prisma.academicFaculty.findFirst({
    where: { university: { nameEn: { contains: 'Suez Canal' } }, nameEn: { contains: 'Medicine' } },
    include: { departments: { include: { programs: true } } }
  });

  if (!scuEng || !ninuEng) throw new Error('Missing test faculties');

  const scuCivilDept = scuEng.departments.find(d => d.nameEn.includes('Civil')) || scuEng.departments[0];
  const ninuElecDept = ninuEng.departments.find(d => d.nameEn.includes('Electrical')) || ninuEng.departments[1] || ninuEng.departments[0];
  const scuMedDept = scuMed?.departments[0];

  const studentScuCivil = await createTestUser('scu_civil@test.com', scuEng.universityId, scuEng.id, scuCivilDept.id, null);
  const studentNinuElec = await createTestUser('ninu_elec@test.com', ninuEng.universityId, ninuEng.id, ninuElecDept.id, null);
  const studentScuMed = scuMedDept ? await createTestUser('scu_med@test.com', scuMed.universityId, scuMed.id, scuMedDept.id, null) : null;

  const course = await prisma.course.create({
    data: {
      title: 'Test Target Groups Course',
      audienceType: EducationLevel.UNIVERSITY,
      status: 'PUBLISHED',
      targetGroups: {
        create: [
          {
            targetUniversityId: scuEng.universityId,
            targetFacultyId: scuEng.id,
            targetDepartmentId: scuCivilDept.id
          },
          {
            targetUniversityId: ninuEng.universityId,
            targetFacultyId: ninuEng.id,
            targetDepartmentId: ninuElecDept.id
          }
        ]
      }
    }
  });

  const legacyCourse = await prisma.course.create({
    data: {
      title: 'Legacy Course',
      audienceType: EducationLevel.UNIVERSITY,
      status: 'PUBLISHED',
      targetUniversityId: scuEng.universityId,
      targetFacultyId: scuEng.id
    }
  });

  console.log(`Course 1 (Groups) created: ${course.id}`);
  console.log(`Course 2 (Legacy) created: ${legacyCourse.id}`);

  const scuCivilCourses = await getCoursesForStudent(studentScuCivil);
  const seesCourse1 = scuCivilCourses.some(c => c.id === course.id);
  const seesLegacy = scuCivilCourses.some(c => c.id === legacyCourse.id);
  console.log(`SCU Civil Student sees Group Course: ${seesCourse1 ? 'PASS' : 'FAIL'}`);
  console.log(`SCU Civil Student sees Legacy Course: ${seesLegacy ? 'PASS' : 'FAIL'}`);

  const ninuElecCourses = await getCoursesForStudent(studentNinuElec);
  const ninuSeesCourse1 = ninuElecCourses.some(c => c.id === course.id);
  const ninuSeesLegacy = ninuElecCourses.some(c => c.id === legacyCourse.id);
  console.log(`NINU Elec Student sees Group Course: ${ninuSeesCourse1 ? 'PASS' : 'FAIL'}`);
  console.log(`NINU Elec Student sees Legacy Course (should not): ${!ninuSeesLegacy ? 'PASS' : 'FAIL'}`);

  if (studentScuMed) {
    const scuMedCourses = await getCoursesForStudent(studentScuMed);
    const medSeesCourse1 = scuMedCourses.some(c => c.id === course.id);
    const medSeesLegacy = scuMedCourses.some(c => c.id === legacyCourse.id);
    console.log(`SCU Med Student sees Group Course (should not): ${!medSeesCourse1 ? 'PASS' : 'FAIL'}`);
    console.log(`SCU Med Student sees Legacy Course (should not): ${!medSeesLegacy ? 'PASS' : 'FAIL'}`);
  }

  await prisma.course.delete({ where: { id: course.id } });
  await prisma.course.delete({ where: { id: legacyCourse.id } });
  await prisma.user.deleteMany({ where: { email: { contains: '@test.com' } } });

  console.log('--- END TEST ---');
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
