import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const extended = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        console.log(`Intercepted model: "${model}", operation: "${operation}"`);
        return query(args);
      },
    },
  },
});

async function main() {
  await extended.course.findMany({ take: 1 });
  await prisma.$disconnect();
}
main();
