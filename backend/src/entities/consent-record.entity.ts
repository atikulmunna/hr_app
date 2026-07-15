import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// An employee's consent to a specific statement version (T-1F.1, FR-M13-01).
// Retained through withdrawal for the audit trail; withdrawnAt marks it inactive.
@Entity('consent_records')
export class ConsentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'statement_id' })
  statementId: string;

  @Column()
  platform: string;

  @Column()
  version: number;

  @Column({ type: 'text', array: true })
  scope: string[];

  @Column({ name: 'granted_at', type: 'timestamptz' })
  grantedAt: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt?: Date | null;
}
