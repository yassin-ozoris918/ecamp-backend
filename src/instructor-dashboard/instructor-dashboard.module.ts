import { Module } from '@nestjs/common';
import { InstructorDashboardService } from './instructor-dashboard.service';
import { InstructorDashboardController } from './instructor-dashboard.controller';

@Module({
  providers: [InstructorDashboardService],
  controllers: [InstructorDashboardController],
})
export class InstructorDashboardModule {}
