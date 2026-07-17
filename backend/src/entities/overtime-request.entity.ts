import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// 'derived' claims hours the summary computed from the marks; 'declared' is the
// manual exception path for hours the marks did not capture (FR-M2-06).
export type OvertimeSource = 'derived' | 'declared';

// A claim for a date's overtime, payable only once approved (FR-M2-06, O-07).
// Effective status is the linked approval's, so there is nothing to materialize:
// a payroll run sums the approved hours falling in its period.
@Entity('overtime_requests')
export class OvertimeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  hours: string;

  @Column()
  source: OvertimeSource;

  @Column()
  reason: string;

  @Column({ name: 'approval_request_id', nullable: true })
  approvalRequestId?: string;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
