import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

// Standard HR dashboards (T-2.7, FR-M10-01). Read-only aggregates; the tenant
// database service and its RLS scoping come from the global TenantModule.
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
