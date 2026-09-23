import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A scheduled interview for an application (T-3.1, FR-M5-05). Each interview
// gathers one scorecard per reviewer, so a hiring decision rests on collaborative
// feedback rather than a single verdict.
export type InterviewMode = 'onsite' | 'phone' | 'video';

@Entity('interviews')
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'application_id' })
  applicationId: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ default: 'video' })
  mode: InterviewMode;

  @Column({ name: 'interviewer_sub', type: 'text', nullable: true })
  interviewerSub?: string | null;

  @Column({ name: 'interviewer_name', type: 'text', nullable: true })
  interviewerName?: string | null;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
