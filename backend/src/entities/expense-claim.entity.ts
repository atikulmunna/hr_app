import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// An expense claim header (T-2.6, FR-M8-01 to FR-M8-03). An employee builds it
// as a draft of lines, submits it through the shared workflow to their manager,
// and once approved HR settles it via payroll or disbursement.
export type ExpenseClaimStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'settled'
  | 'cancelled';

export type ExpenseSettlementMethod = 'payroll' | 'disbursement';

@Entity('expense_claims')
export class ExpenseClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id' })
  legalEntityId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column()
  title: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  @Column({ default: 'draft' })
  status: ExpenseClaimStatus;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId?: string | null;

  // How an approved claim was paid; and, for the payroll route, the adjustment
  // that carries it onto a payslip.
  @Column({ name: 'settlement_method', type: 'text', nullable: true })
  settlementMethod?: ExpenseSettlementMethod | null;

  @Column({ name: 'adjustment_id', type: 'uuid', nullable: true })
  adjustmentId?: string | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt?: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
