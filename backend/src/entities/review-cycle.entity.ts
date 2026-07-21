import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A configurable appraisal cycle (T-3.2, FR-M6-02). Drafted, then activated to
// generate appraisals, moved to calibration for final ratings, then closed.
export type CycleType = 'annual' | 'quarterly' | 'probation';
export type CycleStatus = 'draft' | 'active' | 'calibration' | 'closed';

@Entity('review_cycles')
export class ReviewCycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'cycle_type', default: 'annual' })
  cycleType: CycleType;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'rating_scale_id' })
  ratingScaleId: string;

  @Column({ default: 'draft' })
  status: CycleStatus;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
