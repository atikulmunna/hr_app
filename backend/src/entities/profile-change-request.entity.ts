import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A self-service request to change sensitive profile fields (name), pending HR
// approval (T-1E.1, FR-M9-01). Effective status is the linked approval's status;
// applied_at marks the one-time application to the employee record.
@Entity('profile_change_requests')
export class ProfileChangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ type: 'jsonb' })
  changes: Record<string, string>;

  @Column({ name: 'approval_request_id', nullable: true })
  approvalRequestId?: string;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt?: Date;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
