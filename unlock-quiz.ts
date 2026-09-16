import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const quizTitle = process.argv[2] || "Quiz On Lecture One";
  
  const quiz = await prisma.quiz.findFirst({ where: { title: quizTitle } });
  
  if (!quiz) {
    console.error(`Quiz '${quizTitle}' not found.`);
    process.exit(1);
  }

  // Delete all attempts and responses for this quiz so it can be edited again
  const deletedResponses = await prisma.quizAttemptResponse.deleteMany({
    where: {
      attempt: {
        quizId: quiz.id
      }
    }
  });

  const deletedAttempts = await prisma.quizAttempt.deleteMany({
    where: {
      quizId: quiz.id
    }
  });

  console.log(`Successfully unlocked the quiz for editing!`);
  console.log(`Deleted ${deletedAttempts.count} test attempts and ${deletedResponses.count} question responses.`);
}

main().finally(() => prisma.$disconnect());
