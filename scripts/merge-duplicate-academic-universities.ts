import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SCU_CANONICAL_AR = 'جامعة قناة السويس (SCU)';
const SCU_CANONICAL_EN = 'Suez Canal University (SCU)';
const SCU_VARIANTS = [SCU_CANONICAL_AR, 'جامعة قناة السويس', 'Suez Canal University'];

const NINU_CANONICAL_AR = 'جامعة الإسماعيلية الجديدة الأهلية (NINU)';
const NINU_CANONICAL_EN = 'New Ismailia National University (NINU)';
const NINU_VARIANTS = [NINU_CANONICAL_AR, 'جامعة الإسماعيلية الجديدة الأهلية', 'New Ismailia National University'];

async function cascadeDeactivate(tx: any, universityId: string) {
  // Deactivate the university
  await tx.academicUniversity.update({
    where: { id: universityId },
    data: { isActive: false }
  });

  // Find all faculties of this university
  const facs = await tx.academicFaculty.findMany({ where: { universityId } });
  const facIds = facs.map((f: any) => f.id);

  if (facIds.length > 0) {
    // Deactivate faculties
    await tx.academicFaculty.updateMany({
      where: { id: { in: facIds } },
      data: { isActive: false }
    });

    // Deactivate departments
    await tx.academicDepartment.updateMany({
      where: { facultyId: { in: facIds } },
      data: { isActive: false }
    });

    // Deactivate programs
    await tx.academicProgram.updateMany({
      where: { facultyId: { in: facIds } },
      data: { isActive: false }
    });
  }
}

async function processUniversity(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  canonicalAr: string,
  canonicalEn: string,
  variants: string[]
) {
  console.log(`\n--- Processing: ${canonicalAr} ---`);

  const rawRecords = await tx.academicUniversity.findMany({
    where: { nameAr: { in: variants }, isActive: true }
  });

  if (rawRecords.length === 0) {
    console.log(`No records found for ${canonicalAr}. Skipping.`);
    return null;
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
        await tx.user.update({ where: { id: u.id }, data: { universityId: canonicalRecord.id } });
        totalMigratedUsers++;
      } else {
        const validChild = await tx.academicFaculty.findFirst({
          where: { id: u.facultyId || undefined, universityId: canonicalRecord.id }
        });

        if (validChild) {
          await tx.user.update({ where: { id: u.id }, data: { universityId: canonicalRecord.id } });
          totalMigratedUsers++;
        } else {
          console.error(`[CONFLICT] User ${u.id} has child records belonging to a different hierarchy (Faculty: ${u.facultyId}). Cannot safely migrate.`);
          totalConflicts++;
        }
      }
    }

    console.log(`[DRY-RUN] Deactivating duplicate university & children: ${dup.id}`);
    await cascadeDeactivate(tx, dup.id);
  }

  // Rename canonical
  if (canonicalRecord.nameAr !== canonicalAr || canonicalRecord.nameEn !== canonicalEn) {
    console.log(`[DRY-RUN] Renaming canonical university to ${canonicalAr}`);
    await tx.academicUniversity.update({
      where: { id: canonicalRecord.id },
      data: { nameAr: canonicalAr, nameEn: canonicalEn, isActive: true }
    });
  } else {
    // Ensure active
    if (!canonicalRecord.isActive) {
      await tx.academicUniversity.update({
        where: { id: canonicalRecord.id },
        data: { isActive: true }
      });
    }
  }

  return { totalConflicts, totalMigratedUsers, canonicalId: canonicalRecord.id };
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
      let scuId: string | null = null;
      let ninuId: string | null = null;

      const scuResult = await processUniversity(tx, SCU_CANONICAL_AR, SCU_CANONICAL_EN, SCU_VARIANTS);
      if (scuResult?.totalConflicts) conflicts += scuResult.totalConflicts;
      if (scuResult?.canonicalId) scuId = scuResult.canonicalId;

      const ninuResult = await processUniversity(tx, NINU_CANONICAL_AR, NINU_CANONICAL_EN, NINU_VARIANTS);
      if (ninuResult?.totalConflicts) conflicts += ninuResult.totalConflicts;
      if (ninuResult?.canonicalId) ninuId = ninuResult.canonicalId;

      console.log(`\n--- Deactivating Legacy Universities ---`);
      
      const excludeIds = [];
      if (scuId) excludeIds.push(scuId);
      if (ninuId) excludeIds.push(ninuId);

      const others = await tx.academicUniversity.findMany({
        where: {
          id: { notIn: excludeIds },
          isActive: true
        }
      });

      for (const o of others) {
        console.log(`[DRY-RUN] Deactivating legacy university & children: ${o.nameAr} (${o.id})`);
        await cascadeDeactivate(tx, o.id);
      }

      const pass = await verifyInvariants(tx);

      if (conflicts > 0) {
        throw new Error(`Migration blocked due to ${conflicts} unresolved conflicts.`);
      }

      if (!pass) {
        throw new Error(`Migration blocked due to failed invariants.`);
      }

      if (isDryRun) {
        // Force a rollback so no data is actually written
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
