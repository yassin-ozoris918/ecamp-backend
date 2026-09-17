const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Deleting all quiz attempts...');
  const result = await prisma.quizAttempt.deleteMany({});
  console.log(`Successfully deleted ${result.count} quiz attempts.`);
}

main()
  .catch((e) => {
    console.error('Error deleting quiz attempts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
