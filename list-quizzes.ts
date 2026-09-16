import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const quizzes = await prisma.quiz.findMany({ 
    where: { title: 'Quiz On Lecture One' },
    include: { _count: { select: { questions: true } } }
  });
  console.log(quizzes.map(q => ({ id: q.id, title: q.title, deletedAt: q.deletedAt, questions: q._count.questions })));
}
main().finally(() => prisma.$disconnect());
