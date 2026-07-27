import { Module } from '@nestjs/common';
import { StudentRiskAnalyzer } from './student-risk.analyzer';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [StudentRiskAnalyzer],
})
export class AnalyticsModule {}
