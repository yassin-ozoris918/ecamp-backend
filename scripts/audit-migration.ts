import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('Auditing academic data migration using raw SQL...');
  const users: any[] = await prisma.$queryRaw`SELECT "id", "university", "faculty", "department", "academicYear" FROM "User" WHERE "educationLevel" = 'UNIVERSITY'`;
  const courses: any[] = await prisma.$queryRaw`SELECT "id", "targetUniversity", "targetFaculty", "targetDepartment", "targetAcademicYear" FROM "Course" WHERE "audienceType" = 'UNIVERSITY'`;

  const universities = await prisma.academicUniversity.findMany({ include: { faculties: { include: { departments: { include: { programs: true } }, programs: true } } } });

  const report = {
    users: [] as any[],
    courses: [] as any[],
    academicYearUsage: {
      usersWithAcademicYear: users.filter(u => u.academicYear).length,
      coursesWithTargetAcademicYear: courses.filter(c => c.targetAcademicYear).length
    }
  };

  const otherUni = universities.find(u => u.isOther);

  const normalize = (str: string | null | undefined) => str ? str.trim().toLowerCase() : null;

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

    report.users.push({
      userId: u.id,
      oldUniversity: u.university,
      oldFaculty: u.faculty,
      oldDepartment: u.department,
      proposedUniversityMatch: uMatch ? uMatch.nameEn : (u.university ? 'OTHER' : null),
      proposedFacultyMatch: fMatch ? fMatch.nameEn : null,
      proposedDepartmentMatch: dMatch ? dMatch.nameEn : null,
      proposedProgramMatch: pMatch ? pMatch.nameEn : null,
      unmatchedValues: {
        university: uMatch ? null : u.university,
        faculty: fMatch ? null : u.faculty,
        department: (dMatch || pMatch) ? null : u.department
      }
    });
  }

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

    report.courses.push({
      courseId: c.id,
      oldTargetUniversity: c.targetUniversity,
      oldTargetFaculty: c.targetFaculty,
      oldTargetDepartment: c.targetDepartment,
      proposedUniversityMatch: uMatch ? uMatch.nameEn : (c.targetUniversity ? 'OTHER' : null),
      proposedFacultyMatch: fMatch ? fMatch.nameEn : null,
      proposedDepartmentMatch: dMatch ? dMatch.nameEn : null,
      proposedProgramMatch: pMatch ? pMatch.nameEn : null,
      unmatchedValues: {
        targetUniversity: uMatch ? null : c.targetUniversity,
        targetFaculty: fMatch ? null : c.targetFaculty,
        targetDepartment: (dMatch || pMatch) ? null : c.targetDepartment
      }
    });
  }

  fs.writeFileSync('migration-audit-report.json', JSON.stringify(report, null, 2));
  console.log('Audit complete. Check migration-audit-report.json');
}

main().catch(console.error).finally(() => prisma.$disconnect());
