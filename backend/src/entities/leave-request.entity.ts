import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// An employee's leave request (T-1D.2). The effective status is the linked
// approval request's status, so it is not duplicated here.
@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'leave_type_id' })
  leaveTypeId: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'working_days', type: 'numeric', precision: 5, scale: 1 })
  workingDays: number;

  @Column({ nullable: true })
  reason?: string;

  @Column({ name: 'approval_request_id', nullable: true })
  approvalRequestId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
