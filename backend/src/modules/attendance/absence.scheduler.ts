import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AbsenceService } from './absence.service';

// Runs the absence sweep for the previous day across all tenants. The cut-off
// is approximated by running well after any shift start; per-entity timezone
// and cut-off configuration land with tenant configuration (T-1C.12).
@Injectable()
export class AbsenceScheduler {
  private readonly logger = new Logger(AbsenceScheduler.name);

  constructor(private readonly absence: AbsenceService) {}

  @Cron('0 30 2 * * *')
  async nightly(): Promise<void> {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    const date = d.toISOString().slice(0, 10);
    this.logger.log(`nightly absence run for ${date}`);
    await this.absence.runAllTenants(date);
  }
}
