import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AnalyticsService } from './analytics.service';

// Standard HR dashboards (T-2.7, FR-M10-01). Read-only and gated by
// analytics:read, so only HR and the tenant admin see them (FR-M10-05).
@Controller('analytics')
@RequirePermissions('analytics:read')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('headcount')
  headcount() {
    return this.analytics.headcount();
  }

  @Get('attrition')
  attrition(@Query('months') months?: string) {
    return this.analytics.attrition(months ? Number(months) : undefined);
  }

  @Get('absence')
  absence(@Query('months') months?: string) {
    return this.analytics.absence(months ? Number(months) : undefined);
  }

  @Get('overtime')
  overtime(@Query('months') months?: string) {
    return this.analytics.overtime(months ? Number(months) : undefined);
  }

  @Get('cost-to-company')
  costToCompany(@Query('months') months?: string) {
    return this.analytics.costToCompany(months ? Number(months) : undefined);
  }

  // Fraud-signal analytics (FR-M10-06, FR-AT-34): flag rate by team, repeat
  // offenders, device re-binds, and regularization rate.
  @Get('flag-rate-by-team')
  flagRateByTeam(@Query('months') months?: string) {
    return this.analytics.flagRateByTeam(months ? Number(months) : undefined);
  }

  @Get('repeat-signals')
  repeatSignals(
    @Query('months') months?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.repeatSignals(
      months ? Number(months) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('device-rebinds')
  deviceRebinds(
    @Query('months') months?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.deviceRebinds(
      months ? Number(months) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('regularizations')
  regularizations(
    @Query('months') months?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.regularizations(
      months ? Number(months) : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
