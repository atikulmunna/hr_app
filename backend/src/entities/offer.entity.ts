import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// An offer letter and its click-to-sign audit (T-3.1, FR-M5-07, FR-M1-09). The
// letter text is generated and frozen with a SHA-256 hash when the offer is
// sent; signing captures the candidate's typed name, the time, and the client
// IP. A signed offer converts the candidate into an employee (employeeId).
export type OfferStatus = 'sent' | 'signed' | 'declined' | 'rescinded';

@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'application_id' })
  applicationId: string;

  @Column({ name: 'salary_amount', type: 'numeric', precision: 14, scale: 2 })
  salaryAmount: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'letter_body' })
  letterBody: string;

  @Column({ name: 'document_hash' })
  documentHash: string;

  @Column({ default: 'sent' })
  status: OfferStatus;

  @Column({ name: 'signer_name', type: 'text', nullable: true })
  signerName?: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt?: Date | null;

  @Column({ name: 'signer_ip', type: 'text', nullable: true })
  signerIp?: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId?: string | null;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
