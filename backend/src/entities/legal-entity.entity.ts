import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProrationBasis = 'calendar_days' | 'working_days';

// Which components form the ordinary rate overtime is paid on.
export type OvertimeBase = 'basic' | 'gross';

// How the ordinary hourly rate is derived: from the hours actually expected in
// the period (shift hours x working days), or from a fixed hours-per-month
// figure, which is what the statutory formulas use.
export type OvertimeDivisor = 'expected_hours' | 'fixed_hours';

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

  // The overtime rate is base / divisor x multiplier. Company and jurisdiction
  // policy, so all three are configurable per entity (O-08). Singapore's MOM
  // formula is basic / 190.67 x 1.5; Bangladesh is basic / 208 x 2.0.
  @Column({ name: 'overtime_multiplier', type: 'numeric', precision: 4, scale: 2 })
  overtimeMultiplier: string;

  @Column({ name: 'overtime_base', default: 'basic' })
  overtimeBase: OvertimeBase;

  @Column({ name: 'overtime_divisor', default: 'expected_hours' })
  overtimeDivisor: OvertimeDivisor;

  // Hours per month, required when overtimeDivisor is 'fixed_hours'.
  @Column({
    name: 'overtime_fixed_hours',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  overtimeFixedHours?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
