import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

// Standard HR dashboards and the custom report builder (T-2.7, FR-M10-01/03).
// Read-only; the tenant database service and its RLS scoping come from the
// global TenantModule.
@Module({
  controllers: [AnalyticsController, ReportController],
  providers: [AnalyticsService, ReportService],
})
export class AnalyticsModule {}
