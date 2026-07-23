import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// An employee credential with an optional expiry (T-3.3, FR-M7-04). Status is
// computed on read; reminder_sent_at guards the one-shot lazy expiry reminder.
@Entity('certifications')
export class Certification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  issuer?: string;

  @Column({ name: 'credential_id', nullable: true })
  credentialId?: string;

  @Column({ name: 'issued_on', type: 'date', nullable: true })
  issuedOn?: string | null;

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
