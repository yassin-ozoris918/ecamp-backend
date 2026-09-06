import { Module } from '@nestjs/common';
import { AmaanService } from './amaan.service';

@Module({
  providers: [AmaanService],
  exports: [AmaanService],
})
export class AmaanModule {}
