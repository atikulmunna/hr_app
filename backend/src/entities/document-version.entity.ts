import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One version of a document (T-3.4, FR-M1-07): immutable metadata plus the file's
// SHA-256. The parent document points at its current version.
@Entity('document_versions')
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'document_id' })
  documentId: string;

  @Column()
  version: number;

  @Column()
  sha256: string;

  @Column({ nullable: true })
  note?: string;

  @Column({ name: 'uploaded_by_sub', nullable: true })
  uploadedBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
