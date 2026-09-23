import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One reviewer's scorecard for an interview (T-3.1, FR-M5-05). A unique
// constraint on (interview, reviewer) keeps it to one card per reviewer, so
// collaborative feedback is several reviewers rather than one voting twice.
export type Recommendation = 'strong_yes' | 'yes' | 'no' | 'strong_no';

@Entity('interview_scorecards')
export class InterviewScorecard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'interview_id' })
  interviewId: string;

  @Column({ name: 'reviewer_sub' })
  reviewerSub: string;

  @Column({ name: 'reviewer_name', type: 'text', nullable: true })
  reviewerName?: string | null;

  @Column()
  rating: number;

  @Column()
  recommendation: Recommendation;

  @Column({ type: 'text', nullable: true })
  comments?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
