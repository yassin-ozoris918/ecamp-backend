import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const quizzes = await prisma.quiz.findMany({ where: { title: 'Quiz On Lecture One' } });
  console.log(quizzes);
}
main().finally(() => prisma.$disconnect());
