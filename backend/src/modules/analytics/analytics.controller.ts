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
}
