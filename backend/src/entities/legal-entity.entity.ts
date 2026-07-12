import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A legal entity within a tenant: country, currency, statutory ruleset, residency region.
// Row-level security isolates rows by tenant_id (see InitTenancy migration).
@Entity('legal_entities')
export class LegalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'country_code' })
  countryCode: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  @Column({ name: 'residency_region', default: 'default' })
  residencyRegion: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
