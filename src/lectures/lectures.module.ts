import { Module } from '@nestjs/common';
import { LecturesService } from './lectures.service';
import { LecturesController } from './lectures.controller';
import { CloudflareModule } from '../cloudflare/cloudflare.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AmaanModule } from '../amaan/amaan.module';

@Module({
  imports: [PrismaModule, CloudflareModule, AmaanModule],
  providers: [LecturesService],
  controllers: [LecturesController],
})
export class LecturesModule {}
