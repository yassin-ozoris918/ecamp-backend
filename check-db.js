const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const courses = await prisma.course.findMany({ select: { id: true, title: true, deletedAt: true } });
  console.log('Courses:', courses);
  const lectures = await prisma.lecture.findMany({ select: { id: true, title: true, courseId: true, deletedAt: true } });
  console.log('Lectures:', lectures);
}
check().finally(() => prisma.$disconnect());
