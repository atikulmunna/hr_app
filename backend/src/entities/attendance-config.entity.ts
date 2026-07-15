import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Per-tenant attendance configuration (T-1C.12, FR-AT-15, FR-AT-16). One row
// per tenant. Stored values are overrides; the service merges them onto the
// documented defaults, so a tenant with no row (or a partial row) still scores
// consistently.
@Entity('attendance_config')
export class AttendanceConfig {
  @PrimaryColumn({ name: 'tenant_id' })
  tenantId: string;

  // Partial map of signal key to weight; merged onto the default weights.
  @Column({ type: 'jsonb', default: {} })
  weights: Record<string, number>;

  @Column({ name: 'yellow_threshold', default: 30 })
  yellowThreshold: number;

  @Column({ name: 'red_threshold', default: 60 })
  redThreshold: number;

  @Column({ name: 'score_ceiling', default: 100 })
  scoreCeiling: number;

  @Column({ name: 'accuracy_limit_m', default: 100 })
  accuracyLimitM: number;

  @Column({ name: 'critical_signals', type: 'text', array: true })
  criticalSignals: string[];

  @Column({ name: 'cooccurrence_threshold', default: 2 })
  cooccurrenceThreshold: number;

  @Column({ name: 'hard_block_signals', type: 'text', array: true })
  hardBlockSignals: string[];

  @Column({ name: 'offline_window_hours', default: 12 })
  offlineWindowHours: number;

  @Column({ name: 'marking_start', type: 'time', nullable: true })
  markingStart?: string | null;

  @Column({ name: 'marking_end', type: 'time', nullable: true })
  markingEnd?: string | null;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy?: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
