import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One itemised line of an expense claim (T-2.6, FR-M8-01). The receipt file is
// stored inline because the repo has no object store; the bytes stay auditable
// with the row.
@Entity('expense_claim_lines')
export class ExpenseClaimLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'claim_id' })
  claimId: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: string;

  @Column()
  description: string;

  // The pg driver returns numeric as a string.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'bytea', nullable: true })
  receipt?: Buffer | null;

  @Column({ name: 'receipt_filename', type: 'text', nullable: true })
  receiptFilename?: string | null;

  @Column({ name: 'receipt_mime', type: 'text', nullable: true })
  receiptMime?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
