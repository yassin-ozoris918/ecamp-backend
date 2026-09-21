import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('Archiving academicYear data using raw SQL...');

  const users: any[] = await prisma.$queryRaw`SELECT "id", "academicYear" FROM "User" WHERE "academicYear" IS NOT NULL`;
  const courses: any[] = await prisma.$queryRaw`SELECT "id", "targetAcademicYear" FROM "Course" WHERE "targetAcademicYear" IS NOT NULL`;

  const archive = {
    users,
    courses,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync('academic-year-archive.json', JSON.stringify(archive, null, 2));
  console.log(`Archived ${users.length} users and ${courses.length} courses to academic-year-archive.json`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
