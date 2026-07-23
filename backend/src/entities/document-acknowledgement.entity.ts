import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// An e-signature over a document version (T-3.4, FR-M1-09): a typed name, the
// acknowledged hash, and the signer IP, captured like the recruitment offer sign.
@Entity('document_acknowledgements')
export class DocumentAcknowledgement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'document_id' })
  documentId: string;

  @Column()
  version: number;

  @Column({ name: 'signer_sub' })
  signerSub: string;

  @Column({ name: 'signer_name' })
  signerName: string;

  @Column()
  sha256: string;

  @Column({ name: 'signer_ip', nullable: true })
  signerIp?: string;

  @Column({ name: 'signed_at', type: 'timestamptz', default: () => 'now()' })
  signedAt: Date;
}
