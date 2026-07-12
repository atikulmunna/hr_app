import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type StepStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

// One approval level within a request. Steps are decided in step_order.
@Entity('approval_steps')
export class ApprovalStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'request_id' })
  requestId: string;

  @Column({ name: 'step_order' })
  stepOrder: number;

  // Realm role permitted to decide this step (e.g. manager, hr_admin).
  @Column({ name: 'approver_role' })
  approverRole: string;

  @Column({ default: 'pending' })
  status: StepStatus;

  @Column({ name: 'decided_by_sub', nullable: true })
  decidedBySub?: string;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date;

  @Column({ nullable: true })
  comment?: string;
}
