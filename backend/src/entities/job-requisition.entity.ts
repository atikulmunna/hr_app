import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A job requisition (T-3.1, FR-M5-01): an approved request to recruit against a
// role in one legal entity. It is raised as a draft, submitted through the
// shared workflow to the COO for approval, and once approved accepts
// applications until it is filled or closed.
export type RequisitionStatus =
  'draft' | 'pending' | 'approved' | 'rejected' | 'closed' | 'filled';

@Entity('job_requisitions')
export class JobRequisition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id' })
  legalEntityId: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId?: string | null;

  @Column()
  title: string;

  @Column({ default: 1 })
  headcount: number;

  @Column({ name: 'employment_type', default: 'permanent' })
  employmentType: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'hiring_manager_sub', type: 'text', nullable: true })
  hiringManagerSub?: string | null;

  @Column({ default: 'draft' })
  status: RequisitionStatus;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId?: string | null;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
