import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { PublicController } from './public.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [PrismaModule, ProgressModule],
  controllers: [CoursesController, PublicController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
