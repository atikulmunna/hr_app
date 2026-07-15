import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EnrichmentService } from './enrichment.service';

// Runs the async enrichment pass frequently so a mark is enriched well within
// the target window after receipt (NFR-P-03). Idempotent: only pending marks
// are processed.
@Injectable()
export class EnrichmentScheduler {
  private readonly logger = new Logger(EnrichmentScheduler.name);
  private running = false;

  constructor(private readonly enrichment: EnrichmentService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.enrichment.enrichAllTenants();
    } catch (e) {
      this.logger.error(`enrichment sweep failed: ${e}`);
    } finally {
      this.running = false;
    }
  }
}
