import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

// A generic approval request handled by the shared workflow engine.
@Entity('approval_requests')
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  // e.g. leave, expense, requisition, attendance_regularization, device_rebind
  @Column({ name: 'request_type' })
  requestType: string;

  @Column({ name: 'resource_type', nullable: true })
  resourceType?: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Column({ name: 'requester_sub', nullable: true })
  requesterSub?: string;

  @Column({ default: 'pending' })
  status: ApprovalStatus;

  @Column({ name: 'current_step', default: 1 })
  currentStep: number;

  // True when the requester holds an approver role for this request, so
  // self-approval would be structurally possible. Such requests may also be
  // decided by the escalation role (the COO), which is how a lone manager's own
  // leave still gets an independent decision.
  @Column({ default: false })
  escalatable: boolean;

  @Column({ type: 'jsonb', nullable: true })
  payload?: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
