import { Module } from '@nestjs/common';
import { SupportBotService } from './support-bot.service';
import { SupportBotController } from './support-bot.controller';
import { SupportBotAdminController } from './support-bot.admin.controller';

@Module({
  controllers: [SupportBotController, SupportBotAdminController],
  providers: [SupportBotService],
})
export class SupportBotModule {}
