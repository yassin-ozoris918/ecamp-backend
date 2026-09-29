import { Module } from '@nestjs/common';
import { LecturesService } from './lectures.service';
import { LecturesController } from './lectures.controller';
import { CloudflareModule } from '../cloudflare/cloudflare.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ViewLimitService } from '../sessions/view-limit.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, CloudflareModule, StorageModule],
  providers: [LecturesService, ViewLimitService],
  controllers: [LecturesController],
  exports: [ViewLimitService],
})
export class LecturesModule {}
