import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type CorrectionType = 'missing_check_in' | 'missing_check_out' | 'both';
export type RegularizationOrigin = 'self_service' | 'admin' | 'import';

// An attendance correction request (T-1C.11, FR-AT-32 to FR-AT-35). A
// self-service request links an approval; on approval it is materialized into
// attendance_events with a non-live origin. An admin insert is applied on
// creation. The row is retained as the durable, distinguishable record of the
// correction (PR-07).
@Entity('regularization_requests')
export class RegularizationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'target_date', type: 'date' })
  targetDate: string;

  @Column({ name: 'correction_type' })
  correctionType: CorrectionType;

  @Column({ name: 'requested_check_in', type: 'timestamptz', nullable: true })
  requestedCheckIn?: Date;

  @Column({ name: 'requested_check_out', type: 'timestamptz', nullable: true })
  requestedCheckOut?: Date;

  @Column()
  reason: string;

  @Column({ default: 'self_service' })
  origin: RegularizationOrigin;

  @Column({ name: 'created_by_sub', nullable: true })
  createdBySub?: string;

  @Column({ name: 'approval_request_id', nullable: true })
  approvalRequestId?: string;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
