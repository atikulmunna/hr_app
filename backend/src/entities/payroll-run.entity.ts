import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProrationBasis } from './legal-entity.entity';

export type PayrollRunType = 'monthly' | 'off_cycle';

// One payroll run for a legal entity and period (T-2.2, FR-M4-04). Compensation
// is valued as of cutoffDate; intake covers the period and refreshes on
// recompute, because data landing before lock still belongs to this run
// (FR-AT-39). Runs are recomputable drafts until T-2.4 adds lock and approval.
@Entity('payroll_runs')
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id' })
  legalEntityId: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'cutoff_date', type: 'date' })
  cutoffDate: string;

  @Column({ name: 'run_type' })
  runType: PayrollRunType;

  // Snapshotted from the entity so the run records the rules it was computed on.
  @Column({ name: 'currency_code' })
  currencyCode: string;

  @Column({ name: 'proration_basis' })
  prorationBasis: ProrationBasis;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
