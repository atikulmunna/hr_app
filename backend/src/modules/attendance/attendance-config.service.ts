import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { AttendanceConfig } from '../../entities/attendance-config.entity';
import { AuditService } from '../audit/audit.service';
import {
  DEFAULT_RISK_CONFIG,
  DEFAULT_WEIGHTS,
  RiskConfig,
  SIGNAL_KEYS,
  SignalKey,
} from './scoring';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export interface UpdateConfigInput {
  weights?: Record<string, number>;
  yellowThreshold?: number;
  redThreshold?: number;
  scoreCeiling?: number;
  accuracyLimitM?: number;
  criticalSignals?: string[];
  cooccurrenceThreshold?: number;
  hardBlockSignals?: string[];
  offlineWindowHours?: number;
  markingStart?: string | null;
  markingEnd?: string | null;
}

@Injectable()
export class AttendanceConfigService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  // Effective config within an existing transaction: the tenant's stored
  // overrides merged onto the documented defaults. Used by the mark flow.
  async effective(m: EntityManager): Promise<RiskConfig> {
    const row = await m.findOne(AttendanceConfig, {
      where: { tenantId: this.db.tenantId },
    });
    return merge(row);
  }

  get(): Promise<RiskConfig> {
    return this.db.withTenant((m) => this.effective(m));
  }

  async update(
    patch: UpdateConfigInput,
    actorSub: string | undefined,
  ): Promise<RiskConfig> {
    return this.db.withTenant(async (m) => {
      const existing = await m.findOne(AttendanceConfig, {
        where: { tenantId: this.db.tenantId },
      });
      const row =
        existing ?? m.create(AttendanceConfig, defaultsRow(this.db.tenantId));
      applyPatch(row, patch);
      validate(row);
      row.updatedBy = actorSub;
      await m.save(row);
      await this.audit.record(
        {
          action: 'attendance.config_update',
          resourceType: 'attendance_config',
          resourceId: this.db.tenantId,
          after: patch,
        },
        m,
      );
      return merge(row);
    });
  }
}

function merge(row: AttendanceConfig | null): RiskConfig {
  if (!row) {
    return { ...DEFAULT_RISK_CONFIG, weights: { ...DEFAULT_WEIGHTS } };
  }
  return {
    weights: { ...DEFAULT_WEIGHTS, ...(row.weights ?? {}) },
    yellowThreshold: row.yellowThreshold,
    redThreshold: row.redThreshold,
    scoreCeiling: row.scoreCeiling,
    accuracyLimitM: row.accuracyLimitM,
    criticalSignals: row.criticalSignals ?? [],
    cooccurrenceThreshold: row.cooccurrenceThreshold,
    hardBlockSignals: row.hardBlockSignals ?? [],
    offlineWindowHours: row.offlineWindowHours,
    markingStart: normalizeTime(row.markingStart),
    markingEnd: normalizeTime(row.markingEnd),
  };
}

function defaultsRow(tenantId: string | undefined): Partial<AttendanceConfig> {
  return {
    tenantId,
    weights: {},
    yellowThreshold: DEFAULT_RISK_CONFIG.yellowThreshold,
    redThreshold: DEFAULT_RISK_CONFIG.redThreshold,
    scoreCeiling: DEFAULT_RISK_CONFIG.scoreCeiling,
    accuracyLimitM: DEFAULT_RISK_CONFIG.accuracyLimitM,
    criticalSignals: [...DEFAULT_RISK_CONFIG.criticalSignals],
    cooccurrenceThreshold: DEFAULT_RISK_CONFIG.cooccurrenceThreshold,
    hardBlockSignals: [],
    offlineWindowHours: DEFAULT_RISK_CONFIG.offlineWindowHours,
    markingStart: null,
    markingEnd: null,
  };
}

function applyPatch(row: AttendanceConfig, patch: UpdateConfigInput): void {
  if (patch.weights) {
    row.weights = { ...(row.weights ?? {}), ...patch.weights };
  }
  if (patch.yellowThreshold !== undefined)
    row.yellowThreshold = patch.yellowThreshold;
  if (patch.redThreshold !== undefined) row.redThreshold = patch.redThreshold;
  if (patch.scoreCeiling !== undefined) row.scoreCeiling = patch.scoreCeiling;
  if (patch.accuracyLimitM !== undefined)
    row.accuracyLimitM = patch.accuracyLimitM;
  if (patch.criticalSignals) row.criticalSignals = patch.criticalSignals;
  if (patch.cooccurrenceThreshold !== undefined) {
    row.cooccurrenceThreshold = patch.cooccurrenceThreshold;
  }
  if (patch.hardBlockSignals) row.hardBlockSignals = patch.hardBlockSignals;
  if (patch.offlineWindowHours !== undefined) {
    row.offlineWindowHours = patch.offlineWindowHours;
  }
  if (patch.markingStart !== undefined) row.markingStart = patch.markingStart;
  if (patch.markingEnd !== undefined) row.markingEnd = patch.markingEnd;
}

function validate(row: AttendanceConfig): void {
  assertInt(row.yellowThreshold, 'yellowThreshold', 0);
  assertInt(row.redThreshold, 'redThreshold', 0);
  assertInt(row.scoreCeiling, 'scoreCeiling', 1);
  assertInt(row.accuracyLimitM, 'accuracyLimitM', 1);
  assertInt(row.cooccurrenceThreshold, 'cooccurrenceThreshold', 1);
  assertInt(row.offlineWindowHours, 'offlineWindowHours', 0);
  if (row.redThreshold <= row.yellowThreshold) {
    throw new BadRequestException(
      'redThreshold must be greater than yellowThreshold.',
    );
  }
  if (row.scoreCeiling < row.redThreshold) {
    throw new BadRequestException(
      'scoreCeiling must be at least redThreshold.',
    );
  }
  for (const [key, value] of Object.entries(row.weights ?? {})) {
    assertSignal(key, 'weights');
    if (typeof value !== 'number' || value < 0 || !Number.isFinite(value)) {
      throw new BadRequestException(`Weight for ${key} must be zero or more.`);
    }
  }
  for (const s of row.criticalSignals ?? []) assertSignal(s, 'criticalSignals');
  for (const s of row.hardBlockSignals ?? [])
    assertSignal(s, 'hardBlockSignals');
  validateMarkingWindow(row.markingStart, row.markingEnd);
}

function validateMarkingWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): void {
  const hasStart = start != null && start !== '';
  const hasEnd = end != null && end !== '';
  if (hasStart !== hasEnd) {
    throw new BadRequestException(
      'Set both markingStart and markingEnd, or neither.',
    );
  }
  if (!hasStart) return;
  if (!TIME_PATTERN.test(start!) || !TIME_PATTERN.test(end!)) {
    throw new BadRequestException('Marking times must be in HH:MM format.');
  }
  if (start!.slice(0, 5) >= end!.slice(0, 5)) {
    throw new BadRequestException('markingStart must be before markingEnd.');
  }
}

function assertInt(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new BadRequestException(
      `${name} must be an integer of at least ${min}.`,
    );
  }
}

function assertSignal(key: string, field: string): void {
  if (!SIGNAL_KEYS.includes(key as SignalKey)) {
    throw new BadRequestException(`Unknown signal "${key}" in ${field}.`);
  }
}

function normalizeTime(value: string | null | undefined): string | null {
  return value ? value.slice(0, 5) : null;
}
