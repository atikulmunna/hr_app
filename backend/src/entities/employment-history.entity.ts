import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EmploymentChangeType =
  'hired' | 'transfer' | 'role_change' | 'status_change';

// One entry in an employee's employment timeline (FR-M1-03). Captures the
// employment state as of the change so the timeline is self-contained.
@Entity('employment_history')
export class EmploymentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'change_type' })
  changeType: EmploymentChangeType;

  @Column({ name: 'department_id', nullable: true })
  departmentId?: string;

  @Column({ name: 'manager_id', nullable: true })
  managerId?: string;

  @Column({ name: 'job_title', nullable: true })
  jobTitle?: string;

  @Column({ name: 'employment_type', nullable: true })
  employmentType?: string;

  @Column({ nullable: true })
  status?: string;

  @Column({ nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
