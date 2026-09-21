import { Module } from '@nestjs/common';
import { AcademicDataController } from './academic-data.controller';
import { AcademicDataService } from './academic-data.service';

@Module({
  controllers: [AcademicDataController],
  providers: [AcademicDataService],
  exports: [AcademicDataService],
})
export class AcademicDataModule {}
