const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanUpLegacySoftDeletes() {
  console.log('Starting cleanup of legacy soft-deleted data...');

  const modelsWithDeletedAt = [
    'course',
    'chapter',
    'lecture',
    'session',
    'attachment',
    'chapterAttachment',
    'courseAttachment',
    'exam',
    'quiz',
    'question',
    'activationCode',
    'courseInstructor'
  ];

  for (const model of modelsWithDeletedAt) {
    if (prisma[model]) {
      try {
        const result = await prisma[model].deleteMany({
          where: {
            deletedAt: {
              not: null
            }
          }
        });
        console.log(`Deleted ${result.count} legacy soft-deleted records from ${model}`);
      } catch (e) {
        console.error(`Error deleting from ${model}:`, e.message);
      }
    }
  }

  console.log('Cleanup complete!');
}

cleanUpLegacySoftDeletes().finally(() => prisma.$disconnect());
