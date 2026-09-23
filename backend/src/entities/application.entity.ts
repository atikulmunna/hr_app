import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A candidate's application to a requisition (T-3.1, FR-M5-03). It moves through
// the configurable pipeline stage by stage. source and referralEmployeeId tag
// the channel it came through for yield analysis (FR-M5-06).
export type ApplicationSource =
  'referral' | 'job_board' | 'agency' | 'campus' | 'direct' | 'other';

export type ApplicationStatus = 'active' | 'hired' | 'rejected' | 'withdrawn';

@Entity('applications')
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'requisition_id' })
  requisitionId: string;

  @Column({ name: 'candidate_name' })
  candidateName: string;

  @Column({ name: 'candidate_email' })
  candidateEmail: string;

  @Column({ name: 'candidate_phone', type: 'text', nullable: true })
  candidatePhone?: string | null;

  @Column({ default: 'direct' })
  source: ApplicationSource;

  @Column({ name: 'referral_employee_id', type: 'uuid', nullable: true })
  referralEmployeeId?: string | null;

  @Column({ name: 'stage_id' })
  stageId: string;

  @Column({ default: 'active' })
  status: ApplicationStatus;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
