import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Critical Data-Integrity Test ---');
  
  // Create a temporary university
  const uni = await prisma.academicUniversity.create({
    data: { nameAr: 'Test Uni', nameEn: 'Test Uni En' }
  });

  // Create a temporary user referencing it
  const user = await prisma.user.create({
    data: {
      email: 'test_delete_safety@example.com',
      password: 'hash',
      fullName: 'Test User',
      phoneNumber: '+1000000000',
      educationLevel: 'UNIVERSITY',
      universityId: uni.id,
    }
  });

  console.log('User created:', user.id);

  try {
    // Attempt to delete the university
    await prisma.academicUniversity.delete({
      where: { id: uni.id }
    });
    console.log('FAIL: University was successfully deleted despite user relation!');
  } catch (error: any) {
    if (error.code === 'P2003') {
      console.log('SUCCESS: Deletion rejected due to RESTRICT foreign key constraint on User.universityId');
    } else {
      console.log('UNEXPECTED ERROR:', error);
    }
  }

  // Cleanup
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.academicUniversity.delete({ where: { id: uni.id } });
  console.log('Cleanup successful');
}

main().finally(() => prisma.$disconnect());
