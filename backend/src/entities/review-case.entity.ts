import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReviewCaseStatus = 'open' | 'accepted' | 'rejected' | 'adjusted';

// A flagged attendance mark queued for HR review (T-1C.8). One case per event.
@Entity('review_cases')
export class ReviewCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'event_id' })
  eventId: string;

  // Why the case was opened: 'red_band' or 'co_occurrence'.
  @Column()
  reason: string;

  // The high-confidence signals present on the mark.
  @Column({ type: 'jsonb', default: [] })
  signals: string[];

  @Column({ default: 'open' })
  status: ReviewCaseStatus;

  @Column({ name: 'resolution_note', nullable: true })
  resolutionNote?: string;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy?: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
