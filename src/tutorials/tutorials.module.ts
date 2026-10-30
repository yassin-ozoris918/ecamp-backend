import { Module } from '@nestjs/common';
import { TutorialsService } from './tutorials.service';
import { TutorialsController } from './tutorials.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CloudflareModule } from '../cloudflare/cloudflare.module';

@Module({
  imports: [PrismaModule, StorageModule, CloudflareModule],
  controllers: [TutorialsController],
  providers: [TutorialsService],
})
export class TutorialsModule {}
