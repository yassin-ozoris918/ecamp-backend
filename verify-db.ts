import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- DB Constraints ---');
  const constraints = await prisma.$queryRaw`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM
      information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (tc.table_name = 'User' OR tc.table_name = 'Course')
      AND (kcu.column_name IN ('universityId', 'facultyId', 'departmentId', 'programId', 'targetUniversityId', 'targetFacultyId', 'targetDepartmentId', 'targetProgramId'));
  `;
  console.log(constraints);

  console.log('\n--- Seed Idempotence ---');
  const counts1 = {
    uni: await prisma.academicUniversity.count(),
    fac: await prisma.academicFaculty.count(),
    dep: await prisma.academicDepartment.count(),
    prog: await prisma.academicProgram.count(),
  };
  console.log('Counts:', counts1);
}

main().finally(() => prisma.$disconnect());
