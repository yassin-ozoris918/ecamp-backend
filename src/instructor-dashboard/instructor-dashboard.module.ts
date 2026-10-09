import { Module } from '@nestjs/common';
import { InstructorDashboardService } from './instructor-dashboard.service';
import { InstructorDashboardController, InstructorDashboardStatsController } from './instructor-dashboard.controller';

@Module({
  providers: [InstructorDashboardService],
  controllers: [InstructorDashboardController, InstructorDashboardStatsController],
})
export class InstructorDashboardModule {}
