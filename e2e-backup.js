const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function testBackup() {
  const prisma = new PrismaClient();
  
  // 1. Create test data
  console.log('[1] Creating test data...');
  const user = await prisma.user.create({
    data: {
      email: `backup_test_${Date.now()}@test.com`,
      password: 'hash',
      fullName: 'Backup Test User',
      role: 'STUDENT',
      educationLevel: 'HIGH_SCHOOL'
    }
  });

  const course = await prisma.course.create({
    data: {
      title: 'Backup Test Course',
      description: 'Course to test backup',
      audienceType: 'HIGH_SCHOOL'
    }
  });

  // Verify counts before
  const userCountBefore = await prisma.user.count();
  const courseCountBefore = await prisma.course.count();
  console.log(`BEFORE: Users=${userCountBefore}, Courses=${courseCountBefore}`);

  // 2. Execute backup
  console.log('[2] Executing backup...');
  const backupFile = `C:\\LMS\\backup_${Date.now()}.sql`;
  // Using plain pg_dump
  execSync(`"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe" -U postgres -d lms_db -F c -f "${backupFile}"`, {
    env: { ...process.env, PGPASSWORD: '0000' }
  });
  console.log(`Backup created at: ${backupFile}`);

  // 3. Delete data
  console.log('[3] Deleting data...');
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  const userCountDeleted = await prisma.user.count();
  const courseCountDeleted = await prisma.course.count();
  console.log(`DELETED: Users=${userCountDeleted}, Courses=${courseCountDeleted}`);

  // Disconnect prisma so we don't hold active connections blocking drop
  await prisma.$disconnect();

  // 4. Restore backup
  console.log('[4] Restoring backup...');
  // Terminate connections and drop/create
  execSync(`"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'lms_db';"`, { env: { ...process.env, PGPASSWORD: '0000' } });
  execSync(`"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -d postgres -c "DROP DATABASE IF EXISTS lms_db;"`, { env: { ...process.env, PGPASSWORD: '0000' } });
  execSync(`"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -d postgres -c "CREATE DATABASE lms_db;"`, { env: { ...process.env, PGPASSWORD: '0000' } });
  
  execSync(`"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe" -U postgres -d lms_db --clean --if-exists "${backupFile}"`, {
    env: { ...process.env, PGPASSWORD: '0000' }
  });
  console.log('Restore completed.');

  // 5. Verify restored records
  const prisma2 = new PrismaClient();
  const userCountAfter = await prisma2.user.count();
  const courseCountAfter = await prisma2.course.count();
  console.log(`AFTER: Users=${userCountAfter}, Courses=${courseCountAfter}`);
  
  await prisma2.$disconnect();
}

testBackup().catch(console.error);
