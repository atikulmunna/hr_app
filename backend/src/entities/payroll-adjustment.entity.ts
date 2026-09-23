import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// An off-cycle payroll adjustment (T-2.5). A signed correction that a locked run
// cannot absorb, settled into a later run instead (FR-M4-11, D-09). Positive
// pays more; negative claws back.
export type PayrollAdjustmentStatus =
  'pending' | 'approved' | 'settled' | 'rejected' | 'cancelled';

@Entity('payroll_adjustments')
export class PayrollAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id' })
  legalEntityId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column()
  reason: string;

  // Signed. The pg driver returns numeric as a string.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  // The locked run this corrects, for traceability. Null for a standalone
  // off-cycle payment.
  @Column({ name: 'source_run_id', type: 'uuid', nullable: true })
  sourceRunId?: string | null;

  @Column({ default: 'pending' })
  status: PayrollAdjustmentStatus;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId?: string | null;

  // The run that paid it out; cleared if that draft run is recomputed or deleted
  // before it locks.
  @Column({ name: 'settled_run_id', type: 'uuid', nullable: true })
  settledRunId?: string | null;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
