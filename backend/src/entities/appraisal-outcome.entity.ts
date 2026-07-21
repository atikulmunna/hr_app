import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// The outcome of an appraisal (T-3.2, FR-M6-06). An increment applies a
// compensation raise; developmentAreas feed L&D. compensationApplied guards the
// raise against being applied twice.
export type OutcomeType = 'none' | 'promotion' | 'increment' | 'pip';

@Entity('appraisal_outcomes')
export class AppraisalOutcome {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'appraisal_id' })
  appraisalId: string;

  @Column({ name: 'outcome_type', default: 'none' })
  outcomeType: OutcomeType;

  @Column({ name: 'increment_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  incrementAmount?: string | null;

  @Column({ name: 'increment_effective_date', type: 'date', nullable: true })
  incrementEffectiveDate?: string | null;

  @Column({ name: 'new_job_title', type: 'text', nullable: true })
  newJobTitle?: string | null;

  @Column({ name: 'development_areas', type: 'text', nullable: true })
  developmentAreas?: string | null;

  @Column({ name: 'compensation_applied', default: false })
  compensationApplied: boolean;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt?: Date | null;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
