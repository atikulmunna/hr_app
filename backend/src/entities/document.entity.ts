import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DocumentVisibility = 'hr_only' | 'employee' | 'all';

// An employee or org-wide document (T-3.4, FR-M1-07). The bytes live outside the
// database; versions carry the SHA-256. visibility is the access-control level.
@Entity('documents')
export class DocumentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId?: string | null;

  @Column()
  name: string;

  @Column({ default: 'other' })
  category: string;

  @Column({ name: 'doc_type', nullable: true })
  docType?: string;

  @Column({ default: 'hr_only' })
  visibility: DocumentVisibility;

  @Column({ name: 'requires_acknowledgement', default: false })
  requiresAcknowledgement: boolean;

  @Column({ name: 'current_version', default: 1 })
  currentVersion: number;

  @Column({ name: 'expires_on', type: 'date', nullable: true })
  expiresOn?: string | null;

  @Column({ name: 'reminder_sent_at', type: 'timestamptz', nullable: true })
  reminderSentAt?: Date | null;

  @Column({ name: 'created_by_sub', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
