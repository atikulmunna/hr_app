import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { TenantDbService } from '../../database/tenant-db.service';
import { RiskBand } from '../../entities/attendance-event.entity';
import { AttendanceConfigService } from './attendance-config.service';
import { ReviewService } from '../review/review.service';
import { IpGeoResolver } from './ip-geo.resolver';
import {
  DEFAULT_WEIGHTS,
  RiskConfig,
  SignalKey,
  bandFor,
  haversineMeters,
} from './scoring';

// Anomalies that are only detectable across marks or against external data, so
// they are computed after the synchronous response. Thresholds are constants
// for now (tenant-configurable weights already apply); tune with T-1C.12.
const IMPOSSIBLE_TRAVEL_KMH = 200;
const MIN_TRAVEL_KM = 1; // ignore GPS jitter between near-simultaneous marks
const IP_GEO_MISMATCH_KM = 100;
const BATCH = 200;

interface PendingRow {
  id: string;
  employeeId: string;
  lat: number | null;
  lng: number | null;
  ip: string | null;
  serverTs: string;
  riskScore: number;
  band: RiskBand;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly config: AttendanceConfigService,
    private readonly review: ReviewService,
    private readonly ipGeo: IpGeoResolver,
    private readonly ctx: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  // Enriches pending live marks in the current tenant. Returns how many were
  // processed and how many gained a signal.
  async enrichForTenant(): Promise<{ processed: number; flagged: number }> {
    return this.db.withTenant(async (m) => {
      const rows: PendingRow[] = await m.query(
        `SELECT id, employee_id AS "employeeId", lat, lng, ip,
                server_ts AS "serverTs", risk_score AS "riskScore", band
         FROM attendance_events
         WHERE enrichment_status = 'pending' AND origin = 'live'
         ORDER BY server_ts
         LIMIT $1`,
        [BATCH],
      );
      if (rows.length === 0) {
        return { processed: 0, flagged: 0 };
      }
      const config = await this.config.effective(m);
      let flagged = 0;
      for (const row of rows) {
        const signals = await this.signalsFor(m, row);
        await this.applyEnrichment(m, row, signals, config);
        if (signals.length > 0) {
          flagged += 1;
        }
      }
      return { processed: rows.length, flagged };
    });
  }

  // Cron entry: enrich every tenant in its own context (no request tenant).
  async enrichAllTenants(): Promise<void> {
    const tenants: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM tenants`,
    );
    for (const t of tenants) {
      try {
        const result = await this.ctx.runWith(t.id, () =>
          this.enrichForTenant(),
        );
        if (result.processed > 0) {
          this.logger.log(
            `enrichment tenant=${t.id} processed=${result.processed} flagged=${result.flagged}`,
          );
        }
      } catch (e) {
        this.logger.error(`enrichment failed for tenant ${t.id}: ${e}`);
      }
    }
  }

  private async signalsFor(
    m: EntityManager,
    row: PendingRow,
  ): Promise<SignalKey[]> {
    const signals: SignalKey[] = [];
    if (await this.impossibleTravel(m, row)) {
      signals.push('impossible_travel');
    }
    if (await this.ipGeoMismatch(row)) {
      signals.push('ip_geo_mismatch');
    }
    return signals;
  }

  private async applyEnrichment(
    m: EntityManager,
    row: PendingRow,
    signals: SignalKey[],
    config: RiskConfig,
  ): Promise<void> {
    const weights = { ...DEFAULT_WEIGHTS, ...config.weights };
    const added = signals.reduce((sum, s) => sum + (weights[s] ?? 0), 0);
    const newScore = Math.min(row.riskScore + added, config.scoreCeiling);
    const critical = signals.some((s) => config.criticalSignals.includes(s));
    // Enrichment can only raise the band, never downgrade the synchronous one.
    const newBand = maxBand(bandFor(newScore, critical, config), row.band);

    await m.query(
      `UPDATE attendance_events
       SET risk_score = $2, band = $3, enrichment_status = 'done',
           enrichment_signals = $4
       WHERE id = $1`,
      [row.id, newScore, newBand, signals],
    );

    if (signals.length > 0 && newBand === 'red' && row.band !== 'red') {
      await this.review.openCase(m, {
        employeeId: row.employeeId,
        eventId: row.id,
        reason: 'enrichment',
        signals,
      });
    }
  }

  private async impossibleTravel(
    m: EntityManager,
    row: PendingRow,
  ): Promise<boolean> {
    if (row.lat == null || row.lng == null) {
      return false;
    }
    const prev: Array<{ lat: number; lng: number; serverTs: string }> =
      await m.query(
        `SELECT lat, lng, server_ts AS "serverTs"
         FROM attendance_events
         WHERE employee_id = $1 AND origin = 'live'
           AND server_ts < $2 AND lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY server_ts DESC
         LIMIT 1`,
        [row.employeeId, row.serverTs],
      );
    if (prev.length === 0) {
      return false;
    }
    const km =
      haversineMeters(row.lat, row.lng, prev[0].lat, prev[0].lng) / 1000;
    if (km < MIN_TRAVEL_KM) {
      return false;
    }
    // server_ts arrives as a Date from the driver; new Date(...).getTime()
    // preserves milliseconds, whereas Date.parse on a Date drops them.
    const hours =
      (new Date(row.serverTs).getTime() -
        new Date(prev[0].serverTs).getTime()) /
      3_600_000;
    if (hours <= 0) {
      return false;
    }
    return km / hours > IMPOSSIBLE_TRAVEL_KMH;
  }

  private async ipGeoMismatch(row: PendingRow): Promise<boolean> {
    if (!row.ip || row.lat == null || row.lng == null) {
      return false;
    }
    const point = await this.ipGeo.resolve(row.ip);
    if (!point) {
      return false;
    }
    const km = haversineMeters(row.lat, row.lng, point.lat, point.lng) / 1000;
    return km > IP_GEO_MISMATCH_KM;
  }
}

const BAND_RANK: Record<RiskBand, number> = { clean: 0, yellow: 1, red: 2 };

function maxBand(a: RiskBand, b: RiskBand): RiskBand {
  return BAND_RANK[a] >= BAND_RANK[b] ? a : b;
}
