import { Controller, Post } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import { EnrichmentService } from './enrichment.service';

// Manual trigger for the async enrichment pass (T-1C.5). The sweep runs on a
// schedule; this lets HR force a pass for the current tenant (e.g. testing).
@Controller()
export class EnrichmentController {
  constructor(private readonly enrichment: EnrichmentService) {}

  @RequirePermissions('attendance:review')
  @Post('attendance/enrich-run')
  run() {
    return this.enrichment.enrichForTenant();
  }
}
