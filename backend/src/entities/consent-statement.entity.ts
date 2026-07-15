import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ConsentPlatform = 'android' | 'ios';

// A versioned, per-platform purpose statement (T-1F.1, FR-M13-02). The active
// version for a platform is what an employee consents to before marking.
@Entity('consent_statements')
export class ConsentStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  platform: ConsentPlatform;

  @Column()
  version: number;

  @Column()
  body: string;

  // The signal categories collected under this statement (minimization scope,
  // FR-M13-05), e.g. location, device_integrity, network.
  @Column({ type: 'text', array: true })
  signals: string[];

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'created_by', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
