import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A request to exchange two roster entries between two employees (T-1E.3,
// FR-M2-02). Effective status is the linked approval's status; applied_at marks
// the one-time exchange after approval.
@Entity('shift_swap_requests')
export class ShiftSwapRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'requester_employee_id' })
  requesterEmployeeId: string;

  @Column({ name: 'requester_entry_id' })
  requesterEntryId: string;

  @Column({ name: 'counterparty_employee_id' })
  counterpartyEmployeeId: string;

  @Column({ name: 'counterparty_entry_id' })
  counterpartyEntryId: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ name: 'approval_request_id', nullable: true })
  approvalRequestId?: string;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt?: Date;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
