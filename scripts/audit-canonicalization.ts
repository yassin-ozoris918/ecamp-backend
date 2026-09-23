import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- PRODUCTION READ-ONLY CANONICALIZATION AUDIT ---');

  const unis = await prisma.academicUniversity.findMany({
    include: {
      faculties: {
        include: {
          departments: {
            include: {
              programs: true
            }
          }
        }
      }
    }
  });

  console.log('\n[UNIVERSITIES]');
  for (const u of unis) {
    console.log(`- ID: ${u.id} | AR: ${u.nameAr} | EN: ${u.nameEn} | Active: ${u.isActive}`);
  }

  console.log('\n[FACULTIES]');
  for (const u of unis) {
    for (const f of u.faculties) {
      console.log(`  - ID: ${f.id} | Uni: ${f.universityId} | AR: ${f.nameAr} | Active: ${f.isActive}`);
    }
  }

  console.log('\n[DEPARTMENTS]');
  for (const u of unis) {
    for (const f of u.faculties) {
      for (const d of f.departments) {
        console.log(`    - ID: ${d.id} | Fac: ${d.facultyId} | AR: ${d.nameAr} | Active: ${d.isActive}`);
      }
    }
  }

  console.log('\n[PROGRAMS]');
  for (const u of unis) {
    for (const f of u.faculties) {
      for (const d of f.departments) {
        for (const p of d.programs) {
          console.log(`      - ID: ${p.id} | Dept: ${p.departmentId} | AR: ${p.nameAr} | Type: ${p.type} | Active: ${p.isActive}`);
        }
      }
    }
  }

  const activeUnis = unis.filter(u => u.isActive).length;
  const inactiveUnis = unis.length - activeUnis;
  
  const allFacs = unis.flatMap(u => u.faculties);
  const activeFacs = allFacs.filter(f => f.isActive).length;
  const inactiveFacs = allFacs.length - activeFacs;

  const allDepts = allFacs.flatMap(f => f.departments);
  const activeDepts = allDepts.filter(d => d.isActive).length;
  const inactiveDepts = allDepts.length - activeDepts;

  const allProgs = allDepts.flatMap(d => d.programs);
  const activeProgs = allProgs.filter(p => p.isActive).length;
  const inactiveProgs = allProgs.length - activeProgs;

  console.log(`\n[COUNTS]`);
  console.log(`Universities: Active ${activeUnis}, Inactive ${inactiveUnis}`);
  console.log(`Faculties: Active ${activeFacs}, Inactive ${inactiveFacs}`);
  console.log(`Departments: Active ${activeDepts}, Inactive ${inactiveDepts}`);
  console.log(`Programs: Active ${activeProgs}, Inactive ${inactiveProgs}`);

  console.log('\n[USER REFERENCES]');
  for (const u of unis) {
    const count = await prisma.user.count({ where: { universityId: u.id } });
    if (count > 0) console.log(`- Uni ${u.id} (${u.nameAr}): ${count} users`);
  }

  for (const f of allFacs) {
    const count = await prisma.user.count({ where: { facultyId: f.id } });
    if (count > 0) console.log(`- Fac ${f.id} (${f.nameAr}): ${count} users`);
  }

  for (const d of allDepts) {
    const count = await prisma.user.count({ where: { departmentId: d.id } });
    if (count > 0) console.log(`- Dept ${d.id} (${d.nameAr}): ${count} users`);
  }

  for (const p of allProgs) {
    const count = await prisma.user.count({ where: { programId: p.id } });
    if (count > 0) console.log(`- Prog ${p.id} (${p.nameAr}): ${count} users`);
  }

  console.log('\n[CROSS-HIERARCHY VALIDATION]');
  let conflicts = 0;
  let orphans = 0;

  // Find users with mismatched hierarchies
  const users = await prisma.user.findMany({
    where: { universityId: { not: null } },
    select: { id: true, universityId: true, facultyId: true, departmentId: true, programId: true }
  });

  for (const u of users) {
    if (u.facultyId) {
      const fac = allFacs.find(f => f.id === u.facultyId);
      if (!fac) {
        console.log(`[ORPHAN] User ${u.id} has non-existent faculty ${u.facultyId}`);
        orphans++;
      } else if (fac.universityId !== u.universityId) {
        console.log(`[CONFLICT] User ${u.id} has faculty ${u.facultyId} under wrong university`);
        conflicts++;
      }
    }
    if (u.departmentId) {
      const dep = allDepts.find(d => d.id === u.departmentId);
      if (!dep) {
        console.log(`[ORPHAN] User ${u.id} has non-existent department ${u.departmentId}`);
        orphans++;
      } else if (dep.facultyId !== u.facultyId) {
        console.log(`[CONFLICT] User ${u.id} has department ${u.departmentId} under wrong faculty`);
        conflicts++;
      }
    }
  }

  console.log(`Conflicts: ${conflicts}, Orphans: ${orphans}`);
  console.log('--- END AUDIT ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
