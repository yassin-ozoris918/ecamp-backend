import { Module } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { ExamsAdminController } from './exams.admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AiModule],
  controllers: [ExamsController, ExamsAdminController],
  providers: [ExamsService],
})
export class ExamsModule {}
