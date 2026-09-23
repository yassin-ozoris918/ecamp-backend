import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SCU_CANONICAL_AR = 'جامعة قناة السويس (SCU)';
const SCU_CANONICAL_EN = 'Suez Canal University (SCU)';
const SCU_VARIANTS = [SCU_CANONICAL_AR, 'جامعة قناة السويس', 'Suez Canal University'];

const NINU_CANONICAL_AR = 'جامعة الإسماعيلية الجديدة الأهلية (NINU)';
const NINU_CANONICAL_EN = 'New Ismailia National University (NINU)';
const NINU_VARIANTS = [NINU_CANONICAL_AR, 'جامعة الإسماعيلية الجديدة الأهلية', 'New Ismailia National University'];

async function processUniversity(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  canonicalAr: string,
  canonicalEn: string,
  variants: string[],
  isDryRun: boolean
) {
  console.log(`\n--- Processing: ${canonicalAr} ---`);

  const rawRecords = await tx.academicUniversity.findMany({
    where: { nameAr: { in: variants } }
  });

  if (rawRecords.length === 0) {
    console.log(`No records found for ${canonicalAr}. Skipping.`);
    return;
  }

  // Load counts manually
  const records: any[] = [];
  for (const r of rawRecords) {
    const facultiesCount = await tx.academicFaculty.count({ where: { universityId: r.id } });
    const departmentsCount = await tx.academicDepartment.count({ where: { universityId: r.id } });
    const usersCount = await tx.user.count({ where: { universityId: r.id } });
    records.push({
      ...r,
      _count: { faculties: facultiesCount, departments: departmentsCount, users: usersCount }
    });
  }

  // Determine canonical
  let canonicalRecord = records[0];
  let maxScore = -1;

  for (const r of records) {
    const score = r._count.faculties * 100 + r._count.departments * 10 + r._count.users;
    if (score > maxScore) {
      maxScore = score;
      canonicalRecord = r;
    } else if (score === maxScore && r.nameAr === canonicalAr) {
      canonicalRecord = r;
    }
  }

  const duplicates = records.filter(r => r.id !== canonicalRecord.id);

  console.log(`[DRY-RUN] Canonical ID preserved: ${canonicalRecord.id} (name: ${canonicalRecord.nameAr}, faculties: ${canonicalRecord._count.faculties}, users: ${canonicalRecord._count.users})`);
  console.log(`[DRY-RUN] Duplicates detected: ${duplicates.length}`);

  let totalMigratedUsers = 0;
  let totalConflicts = 0;

  for (const dup of duplicates) {
    console.log(`[DRY-RUN] Processing duplicate: ${dup.id} (name: ${dup.nameAr})`);

    const dupUsers = await tx.user.findMany({
      where: { universityId: dup.id },
      select: { id: true, facultyId: true, departmentId: true, programId: true }
    });

    for (const u of dupUsers) {
      if (!u.facultyId && !u.departmentId && !u.programId) {
        if (!isDryRun) {
          await tx.user.update({ where: { id: u.id }, data: { universityId: canonicalRecord.id } });
        }
        totalMigratedUsers++;
      } else {
        const validChild = await tx.academicFaculty.findFirst({
          where: { id: u.facultyId || undefined, universityId: canonicalRecord.id }
        });

        if (validChild) {
          if (!isDryRun) {
            await tx.user.update({ where: { id: u.id }, data: { universityId: canonicalRecord.id } });
          }
          totalMigratedUsers++;
        } else {
          console.error(`[CONFLICT] User ${u.id} has child records belonging to a different hierarchy (Faculty: ${u.facultyId}). Cannot safely migrate.`);
          totalConflicts++;
        }
      }
    }

    console.log(`[DRY-RUN] Deactivating duplicate university: ${dup.id}`);
    if (!isDryRun) {
      await tx.academicUniversity.update({
        where: { id: dup.id },
        data: { isActive: false }
      });
    }
  }

  // Rename canonical
  if (canonicalRecord.nameAr !== canonicalAr || canonicalRecord.nameEn !== canonicalEn) {
    console.log(`[DRY-RUN] Renaming canonical university to ${canonicalAr}`);
    if (!isDryRun) {
      await tx.academicUniversity.update({
        where: { id: canonicalRecord.id },
        data: { nameAr: canonicalAr, nameEn: canonicalEn, isActive: true }
      });
    }
  } else {
    // Ensure active
    if (!isDryRun && !canonicalRecord.isActive) {
      await tx.academicUniversity.update({
        where: { id: canonicalRecord.id },
        data: { isActive: true }
      });
    }
  }

  return { totalConflicts, totalMigratedUsers };
}

async function verifyInvariants(tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) {
  const activeUnis = await tx.academicUniversity.count({ where: { isActive: true } });
  const activeFacs = await tx.academicFaculty.count({ where: { isActive: true } });
  const activeDepts = await tx.academicDepartment.count({ where: { isActive: true } });
  const activeProgs = await tx.academicProgram.count({ where: { isActive: true } });

  console.log(`\n--- Invariants Check ---`);
  console.log(`Active Universities: ${activeUnis} (Expected: 2) -> ${activeUnis === 2 ? 'PASS' : 'FAIL'}`);
  console.log(`Active Faculties: ${activeFacs} (Expected: 3) -> ${activeFacs === 3 ? 'PASS' : 'FAIL'}`);
  console.log(`Active Departments: ${activeDepts} (Expected: 12) -> ${activeDepts === 12 ? 'PASS' : 'FAIL'}`);
  console.log(`Active Programs: ${activeProgs} (Expected: 23) -> ${activeProgs === 23 ? 'PASS' : 'FAIL'}`);

  let hierarchyPass = true;

  // 1. Every active Faculty belongs to one of the two active canonical Universities.
  const activeFacsList = await tx.academicFaculty.findMany({ where: { isActive: true }, include: { university: true } });
  for (const fac of activeFacsList) {
    if (!fac.university.isActive) {
      console.log(`[FAIL] Active faculty ${fac.id} belongs to INACTIVE university ${fac.universityId}`);
      hierarchyPass = false;
    }
  }

  // 2. Every active Department belongs to the correct active Faculty.
  const activeDeptsList = await tx.academicDepartment.findMany({ where: { isActive: true }, include: { faculty: true } });
  for (const dep of activeDeptsList) {
    if (!dep.faculty.isActive) {
      console.log(`[FAIL] Active department ${dep.id} belongs to INACTIVE faculty ${dep.facultyId}`);
      hierarchyPass = false;
    }
  }

  // 3. Every active Program belongs to the correct active Department
  const activeProgsList = await tx.academicProgram.findMany({ where: { isActive: true }, include: { department: true, faculty: true } });
  let prepHasPrograms = false;
  for (const prog of activeProgsList) {
    if (!prog.faculty.isActive) {
      console.log(`[FAIL] Active program ${prog.id} belongs to INACTIVE faculty ${prog.facultyId}`);
      hierarchyPass = false;
    }
    if (prog.department && !prog.department.isActive) {
      console.log(`[FAIL] Active program ${prog.id} belongs to INACTIVE department ${prog.department.id}`);
      hierarchyPass = false;
    }
    if (prog.department && prog.department.nameEn === 'Preparatory / Undeclared') {
      prepHasPrograms = true;
    }
  }

  if (prepHasPrograms) {
    console.log(`[FAIL] Preparatory department has active programs!`);
    hierarchyPass = false;
  }

  const countsPass = activeUnis === 2 && activeFacs === 3 && activeDepts === 12 && activeProgs === 23;
  const pass = countsPass && hierarchyPass;
  
  if (pass) {
    console.log(`EXPECTED FINAL STATE: PASS`);
  } else {
    console.log(`EXPECTED FINAL STATE: BLOCKED`);
  }
  return pass;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`Starting Academic University Merge Script... [DRY RUN: ${isDryRun}]`);

  try {
    await prisma.$transaction(async (tx) => {
      let conflicts = 0;

      const scuResult = await processUniversity(tx, SCU_CANONICAL_AR, SCU_CANONICAL_EN, SCU_VARIANTS, isDryRun);
      if (scuResult?.totalConflicts) conflicts += scuResult.totalConflicts;

      const ninuResult = await processUniversity(tx, NINU_CANONICAL_AR, NINU_CANONICAL_EN, NINU_VARIANTS, isDryRun);
      if (ninuResult?.totalConflicts) conflicts += ninuResult.totalConflicts;

      console.log(`\n--- Deactivating Legacy Universities ---`);
      const others = await tx.academicUniversity.findMany({
        where: {
          nameAr: { notIn: [SCU_CANONICAL_AR, NINU_CANONICAL_AR] },
          isActive: true
        }
      });

      for (const o of others) {
        console.log(`[DRY-RUN] Deactivating legacy: ${o.nameAr} (${o.id})`);
        if (!isDryRun) {
          await tx.academicUniversity.update({
            where: { id: o.id },
            data: { isActive: false }
          });
        }
      }

      await verifyInvariants(tx);

      if (conflicts > 0) {
        throw new Error(`Migration blocked due to ${conflicts} unresolved conflicts.`);
      }

      if (isDryRun) {
        throw new Error('DRY_RUN_SUCCESS');
      }
    });
    console.log('\nMerge script completed successfully.');
  } catch (err: any) {
    if (err.message === 'DRY_RUN_SUCCESS') {
      console.log('\nDry run completed successfully. No changes made.');
    } else {
      console.error(`\nMerge script failed: ${err.message}`);
      process.exit(1);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
