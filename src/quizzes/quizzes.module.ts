import { Module } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { QuizzesAdminController } from './quizzes.admin.controller';
import { PrismaModule } from '../prisma/prisma.module'; // Adjust path if your structure is different
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [PrismaModule, ProgressModule],
  controllers: [QuizzesController, QuizzesAdminController],
  providers: [QuizzesService],
})
export class QuizzesModule {}
