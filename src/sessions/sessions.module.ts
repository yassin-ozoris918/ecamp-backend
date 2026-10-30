import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudflareModule } from '../cloudflare/cloudflare.module';

@Module({
  imports: [PrismaModule, CloudflareModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
