const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'mohammedtharwattt@gmail.com' },
    select: { 
      fullName: true, 
      universityId: true, 
      facultyId: true, 
      departmentId: true,
      academicUniversity: true,
      academicFaculty: true
    }
  });
  console.log("Mohamed Tharwat Details:", user);
}

main().catch(console.error).finally(() => prisma.$disconnect());
