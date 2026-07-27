import { Module } from '@nestjs/common';
import { ReorderController } from './reorder.controller';
import { ReorderService } from './reorder.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReorderController],
  providers: [ReorderService],
})
export class ReorderModule {}
