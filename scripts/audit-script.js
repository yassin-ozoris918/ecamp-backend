const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const assert = require('assert');

async function main() {
  const report = {};
  
  // 1. Verify actual DB state
  const activeUnis = await prisma.academicUniversity.findMany({
    where: { isActive: true },
    include: {
      faculties: {
        where: { isActive: true },
        include: {
          departments: {
            where: { isActive: true },
            include: {
              programs: {
                where: { isActive: true }
              }
            }
          }
        }
      }
    }
  });

  report.activeUniversities = activeUnis.map(u => ({
    nameEn: u.nameEn,
    nameAr: u.nameAr,
    faculties: u.faculties.map(f => ({
      nameEn: f.nameEn,
      nameAr: f.nameAr,
      departments: f.departments.map(d => ({
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        programs: d.programs.map(p => ({
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          type: p.type
        }))
      }))
    }))
  }));

  // 2. Verify ProgramType
  const allActivePrograms = await prisma.academicProgram.findMany({ where: { isActive: true } });
  report.programTypes = allActivePrograms.map(p => ({ nameEn: p.nameEn, type: p.type }));
  report.nullProgramTypes = allActivePrograms.filter(p => !p.type).length;

  // 3. Verify bilingual data
  const missingEnUni = await prisma.academicUniversity.count({ where: { isActive: true, nameEn: '' } });
  const missingArUni = await prisma.academicUniversity.count({ where: { isActive: true, nameAr: '' } });
  const missingEnFac = await prisma.academicFaculty.count({ where: { isActive: true, nameEn: '' } });
  const missingArFac = await prisma.academicFaculty.count({ where: { isActive: true, nameAr: '' } });
  const missingEnDep = await prisma.academicDepartment.count({ where: { isActive: true, nameEn: '' } });
  const missingArDep = await prisma.academicDepartment.count({ where: { isActive: true, nameAr: '' } });
  const missingEnProg = await prisma.academicProgram.count({ where: { isActive: true, nameEn: '' } });
  const missingArProg = await prisma.academicProgram.count({ where: { isActive: true, nameAr: '' } });
  
  report.bilingualIssues = missingEnUni + missingArUni + missingEnFac + missingArFac + missingEnDep + missingArDep + missingEnProg + missingArProg;

  // 4. Verify inactive historical data
  const inactiveUnis = await prisma.academicUniversity.findMany({ where: { isActive: false } });
  const usersWithInactiveUni = await prisma.user.count({ where: { universityId: { in: inactiveUnis.map(u => u.id) } } });
  report.usersWithInactiveUni = usersWithInactiveUni;

  console.log(JSON.stringify(report, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
