import { Module } from '@nestjs/common';
import { ActivationCodesService } from './activation-codes.service';
import { ActivationCodesController } from './activation-codes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ActivationCodesController],
  providers: [ActivationCodesService],
})
export class ActivationCodesModule {}
