const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- 1. SCU COMPUTERS & INFORMATION ---');
  const scu = await prisma.academicUniversity.findFirst({ where: { nameEn: 'Suez Canal University', isActive: true } });
  if (!scu) throw new Error('SCU not found');
  
  const scuComp = await prisma.academicFaculty.findFirst({ where: { nameEn: 'Faculty of Computers and Information', universityId: scu.id, isActive: true } });
  if (!scuComp) {
    console.log('No Faculty of Computers and Info');
  } else {
    const compDeps = await prisma.academicDepartment.findMany({ where: { facultyId: scuComp.id, isActive: true } });
    console.log('Department | Program | ProgramType | isActive');
    for (const dep of compDeps) {
      const progs = await prisma.academicProgram.findMany({ where: { departmentId: dep.id, isActive: true } });
      if (progs.length === 0) {
        console.log(`- ${dep.nameEn} | (none) | (none) | (none)`);
      }
      for (const prog of progs) {
        console.log(`- ${dep.nameEn} | ${prog.nameEn} | ${prog.type} | ${prog.isActive}`);
      }
    }
  }

  console.log('\n--- 11. DATABASE INVARIANTS ---');
  const activeUnis = await prisma.academicUniversity.count({ where: { isActive: true } });
  const activeFacs = await prisma.academicFaculty.count({ where: { isActive: true } });
  const activeDeps = await prisma.academicDepartment.count({ where: { isActive: true } });
  const activeProgs = await prisma.academicProgram.count({ where: { isActive: true } });
  
  const missingNamesUni = await prisma.academicUniversity.count({ where: { isActive: true, OR: [{ nameEn: '' }, { nameAr: '' }] } });
  const missingNamesFac = await prisma.academicFaculty.count({ where: { isActive: true, OR: [{ nameEn: '' }, { nameAr: '' }] } });
  const missingNamesDep = await prisma.academicDepartment.count({ where: { isActive: true, OR: [{ nameEn: '' }, { nameAr: '' }] } });
  const missingNamesProg = await prisma.academicProgram.count({ where: { isActive: true, OR: [{ nameEn: '' }, { nameAr: '' }] } });
  
  const missingType = await prisma.academicProgram.count({ where: { isActive: true, type: null } });
  
  const prepDep = await prisma.academicDepartment.findFirst({ where: { nameEn: 'Preparatory / Undeclared', isActive: true } });
  const prepProgs = prepDep ? await prisma.academicProgram.count({ where: { departmentId: prepDep.id, isActive: true } }) : 0;
  
  // Orphan / parent inactive checks
  let orphanedChildren = 0;
  const allFacs = await prisma.academicFaculty.findMany({ where: { isActive: true }, include: { university: true } });
  allFacs.forEach(f => { if (!f.university || !f.university.isActive) orphanedChildren++; });
  const allDeps = await prisma.academicDepartment.findMany({ where: { isActive: true }, include: { faculty: true } });
  allDeps.forEach(d => { if (!d.faculty || !d.faculty.isActive) orphanedChildren++; });
  const allProgs = await prisma.academicProgram.findMany({ where: { isActive: true }, include: { department: true, faculty: true } });
  allProgs.forEach(p => { 
    if (!p.faculty || !p.faculty.isActive) orphanedChildren++; 
    if (p.departmentId && (!p.department || !p.department.isActive)) orphanedChildren++;
  });

  console.log(`Active Unis: ${activeUnis} (Expected: 2)`);
  console.log(`Active Facs: ${activeFacs} (Expected: 3)`);
  console.log(`Missing Names: ${missingNamesUni + missingNamesFac + missingNamesDep + missingNamesProg}`);
  console.log(`Missing Type: ${missingType}`);
  console.log(`Preparatory Active Programs: ${prepProgs}`);
  console.log(`Active child with inactive/missing parent: ${orphanedChildren}`);

  console.log('\n--- 5. SEED IDEMPOTENCY CHECK ---');
  console.log(`Before seed counts -> U: ${activeUnis}, F: ${activeFacs}, D: ${activeDeps}, P: ${activeProgs}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
