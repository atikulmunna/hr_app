import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A configurable leave type with its per-type rules (FR-M3-01). Bound to a legal
// entity, or tenant-wide when legalEntityId is null (FR-M3-02).
@Entity('leave_types')
export class LeaveType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id', nullable: true })
  legalEntityId?: string;

  @Column()
  code: string;

  @Column()
  name: string;

  // Days granted per year. Accrual automation is deferred (FR-M3-06).
  @Column({ name: 'annual_quota', type: 'numeric', precision: 5, scale: 1, default: 0 })
  annualQuota: number;

  @Column({ name: 'carry_forward_cap', type: 'numeric', precision: 5, scale: 1, default: 0 })
  carryForwardCap: number;

  @Column({ name: 'notice_days', default: 0 })
  noticeDays: number;

  @Column({ default: true })
  paid: boolean;

  @Column({ default: false })
  encashable: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
