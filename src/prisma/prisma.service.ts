import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const modelsWithDeletedAt = [
  'User',
  'Course',
  'Chapter',
  'Lecture',
  'Session',
  'CourseInstructor',
  'ActivationCode',
  'StudentLectureAccess',
  'StudentCourseAccess',
  'Quiz',
  'Exam',
  'StudentBadge',
  'Certificate',
  'Attachment',
  'DeviceSession',
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private extendedClient: any;

  constructor() {
    super();

    // Create an internal extended client
    const baseClient = new PrismaClient();
    this.extendedClient = baseClient.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (modelsWithDeletedAt.includes(model)) {
              if (
                operation === 'findFirst' ||
                operation === 'findFirstOrThrow' ||
                operation === 'findMany' ||
                operation === 'count' ||
                operation === 'aggregate' ||
                operation === 'groupBy'
              ) {
                args.where = { deletedAt: null, ...args.where };
              }
              if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                return (baseClient as any)[model].findFirst({
                  ...args,
                  where: { deletedAt: null, ...args.where },
                });
              }
              if (operation === 'delete') {
                return (baseClient as any)[model].update({
                  ...args,
                  data: { deletedAt: new Date() },
                });
              }
              if (operation === 'deleteMany') {
                return (baseClient as any)[model].updateMany({
                  ...args,
                  data: { deletedAt: new Date() },
                });
              }
            }
            return query(args);
          },
        },
      },
    });

    // Overwrite model delegates on this instance with the extended ones
    for (const key of Object.keys(this.extendedClient)) {
      if (!key.startsWith('$') && !key.startsWith('_')) {
        (this as any)[key] = this.extendedClient[key];
      }
    }

    // Overwrite $transaction to use the extended client
    this.$transaction = this.extendedClient.$transaction.bind(this.extendedClient);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
