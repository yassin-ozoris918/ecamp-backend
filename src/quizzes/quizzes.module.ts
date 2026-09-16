import { Module } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { QuizzesAdminController } from './quizzes.admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProgressModule } from '../progress/progress.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, ProgressModule, AiModule],
  controllers: [QuizzesController, QuizzesAdminController],
  providers: [QuizzesService],
})
export class QuizzesModule {}
