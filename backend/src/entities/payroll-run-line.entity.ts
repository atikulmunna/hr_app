import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayComponentType } from './pay-component.entity';

// One component as paid to one employee in a run (T-2.2).
//
// code, name, componentType, and baseAmount are snapshots taken at run time.
// They are what keep a run's figures stable: editing the catalog or an
// employee's salary afterwards cannot rewrite what this run paid (FR-AT-41,
// D-09). payComponentId is kept only for traceability and may be nulled if the
// catalog entry is deleted.
@Entity('payroll_run_lines')
export class PayrollRunLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'run_id' })
  runId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'pay_component_id', type: 'uuid', nullable: true })
  payComponentId?: string | null;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ name: 'component_type' })
  componentType: PayComponentType;

  // The amount in force at the cut-off, before proration.
  @Column({ name: 'base_amount', type: 'numeric', precision: 14, scale: 2 })
  baseAmount: string;

  @Column({ name: 'proration_factor', type: 'numeric', precision: 6, scale: 4 })
  prorationFactor: string;

  // baseAmount x prorationFactor, rounded to the currency's minor unit.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
