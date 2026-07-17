import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// 'percentage' is a rate on the base, optionally capped by a wage ceiling
// (provident fund, contributions). 'bracket' is progressive slabs over the base
// (income tax).
export type StatutoryCalculation = 'percentage' | 'bracket';

export type StatutoryBase = 'basic' | 'gross';

// A statutory deduction rule for a legal entity (T-2.3, FR-M4-06). Rates are law
// and change most years, so rules are effective-dated and a run resolves the
// ones in force at its cut-off.
@Entity('statutory_rules')
export class StatutoryRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id' })
  legalEntityId: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column()
  calculation: StatutoryCalculation;

  @Column()
  base: StatutoryBase;

  // Percentages. The pg driver returns numeric as a string.
  @Column({ name: 'employee_rate', type: 'numeric', precision: 6, scale: 3 })
  employeeRate: string;

  // Employer cost, never a deduction from net.
  @Column({ name: 'employer_rate', type: 'numeric', precision: 6, scale: 3 })
  employerRate: string;

  // Caps the base a percentage applies to. Null means uncapped.
  @Column({
    name: 'wage_ceiling',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  wageCeiling?: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column()
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
