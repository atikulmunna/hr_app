import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProrationBasis = 'calendar_days' | 'working_days';

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

  // How payroll prorates an incomplete month of work (joiners and leavers). The
  // basis is jurisdictional, so it binds to the entity rather than the tenant
  // (O-06): Singapore prescribes a working-day basis, Bangladesh practice is
  // calendar days.
  @Column({ name: 'proration_basis', default: 'calendar_days' })
  prorationBasis: ProrationBasis;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
