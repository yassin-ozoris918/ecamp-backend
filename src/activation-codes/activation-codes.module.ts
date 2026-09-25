import { Module } from '@nestjs/common';
import { ActivationCodesService } from './activation-codes.service';
import { ActivationCodesController } from './activation-codes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [PrismaModule, CoursesModule],
  controllers: [ActivationCodesController],
  providers: [ActivationCodesService],
})
export class ActivationCodesModule {}
