import { PrismaClient } from '@prisma/client';

class PrismaService extends PrismaClient {
  private extendedClient: any;
  constructor() {
    super();
    const baseClient = new PrismaClient();
    this.extendedClient = baseClient.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            console.log(`[Ext] Intercepted model: "${model}", operation: "${operation}"`);
            return query(args);
          },
        },
      },
    });

    for (const key of Object.keys(this.extendedClient)) {
      if (!key.startsWith('$') && !key.startsWith('_')) {
        (this as any)[key] = this.extendedClient[key];
      }
    }
    this.$transaction = this.extendedClient.$transaction.bind(this.extendedClient);
  }
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  await prisma.course.findMany({ take: 1 });
  await prisma.$disconnect();
}
main();
