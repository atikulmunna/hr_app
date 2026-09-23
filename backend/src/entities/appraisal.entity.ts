import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One employee's appraisal within a cycle (T-3.2, FR-M6-05). Self, manager, and
// final (calibrated) ratings are kept separately so calibration adjusts the
// outcome without losing the inputs.
export type AppraisalStatus =
  'pending' | 'self_review' | 'manager_review' | 'calibrated' | 'closed';

@Entity('appraisals')
export class Appraisal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id' })
  cycleId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'self_rating', type: 'int', nullable: true })
  selfRating?: number | null;

  @Column({ name: 'self_comments', type: 'text', nullable: true })
  selfComments?: string | null;

  @Column({ name: 'manager_rating', type: 'int', nullable: true })
  managerRating?: number | null;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments?: string | null;

  @Column({ name: 'final_rating', type: 'int', nullable: true })
  finalRating?: number | null;

  @Column({ default: 'pending' })
  status: AppraisalStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
