import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Migrating academic data using raw SQL...');
  // We use raw SQL because the old fields have been removed from the Prisma schema.
  const users: any[] = await prisma.$queryRaw`SELECT "id", "university", "faculty", "department" FROM "User" WHERE "educationLevel" = 'UNIVERSITY'`;
  const courses: any[] = await prisma.$queryRaw`SELECT "id", "targetUniversity", "targetFaculty", "targetDepartment" FROM "Course" WHERE "audienceType" = 'UNIVERSITY'`;

  const universities = await prisma.academicUniversity.findMany({ include: { faculties: { include: { departments: { include: { programs: true } }, programs: true } } } });
  const otherUni = universities.find(u => u.isOther);

  const normalize = (str: string | null | undefined) => str ? str.trim().toLowerCase() : null;

  let usersUpdated = 0;
  for (const u of users) {
    if (!u.university && !u.faculty && !u.department) continue;
    
    let uMatch = universities.find(uni => normalize(uni.nameAr) === normalize(u.university) || normalize(uni.nameEn) === normalize(u.university));
    let fMatch: any = null;
    let dMatch: any = null;
    let pMatch: any = null;

    if (uMatch && u.faculty) {
      fMatch = uMatch.faculties.find(fac => normalize(fac.nameAr) === normalize(u.faculty) || normalize(fac.nameEn) === normalize(u.faculty));
      if (fMatch && u.department) {
        dMatch = fMatch.departments.find(dep => normalize(dep.nameAr) === normalize(u.department) || normalize(dep.nameEn) === normalize(u.department));
        pMatch = fMatch.programs.find(prog => normalize(prog.nameAr) === normalize(u.department) || normalize(prog.nameEn) === normalize(u.department));
      }
    }

    const updateData: any = {};
    if (uMatch) {
      updateData.universityId = uMatch.id;
      if (fMatch) {
        updateData.facultyId = fMatch.id;
        if (dMatch) updateData.departmentId = dMatch.id;
        if (pMatch) updateData.programId = pMatch.id;
      }
    } else if (u.university && otherUni) {
      updateData.universityId = otherUni.id;
      updateData.otherUniversityName = u.university;
      updateData.otherFacultyName = u.faculty;
      updateData.otherDepartmentName = u.department;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id: u.id }, data: updateData });
      usersUpdated++;
    }
  }

  let coursesUpdated = 0;
  for (const c of courses) {
    if (!c.targetUniversity && !c.targetFaculty && !c.targetDepartment) continue;
    
    let uMatch = universities.find(uni => normalize(uni.nameAr) === normalize(c.targetUniversity) || normalize(uni.nameEn) === normalize(c.targetUniversity));
    let fMatch: any = null;
    let dMatch: any = null;
    let pMatch: any = null;

    if (uMatch && c.targetFaculty) {
      fMatch = uMatch.faculties.find(fac => normalize(fac.nameAr) === normalize(c.targetFaculty) || normalize(fac.nameEn) === normalize(c.targetFaculty));
      if (fMatch && c.targetDepartment) {
        dMatch = fMatch.departments.find(dep => normalize(dep.nameAr) === normalize(c.targetDepartment) || normalize(dep.nameEn) === normalize(c.targetDepartment));
        pMatch = fMatch.programs.find(prog => normalize(prog.nameAr) === normalize(c.targetDepartment) || normalize(prog.nameEn) === normalize(c.targetDepartment));
      }
    }

    const updateData: any = {};
    if (uMatch) {
      updateData.targetUniversityId = uMatch.id;
      if (fMatch) {
        updateData.targetFacultyId = fMatch.id;
        if (dMatch) updateData.targetDepartmentId = dMatch.id;
        if (pMatch) updateData.targetProgramId = pMatch.id;
      }
    } else if (c.targetUniversity && otherUni) {
      updateData.targetUniversityId = otherUni.id;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.course.update({ where: { id: c.id }, data: updateData });
      coursesUpdated++;
    }
  }

  console.log(`Migration complete. Updated ${usersUpdated} users and ${coursesUpdated} courses.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
