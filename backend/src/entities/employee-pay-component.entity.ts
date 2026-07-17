import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One revision of an employee's amount for a catalog component (T-2.1, T-2.2).
// The amount is always positive; the component type decides its sign in the
// totals. currencyCode is the employee's legal entity currency, which is what
// makes pay multi-currency across entities (FR-M4-03).
//
// Rows are effective-dated: a component has one row per effectiveFrom, and the
// amount in force on a date is the latest row on or before it. This is what lets
// a payroll run value an employee as of its cut-off (FR-AT-39) instead of using
// whatever the record says today.
@Entity('employee_pay_components')
export class EmployeePayComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'pay_component_id' })
  payComponentId: string;

  // numeric(14,2) comes back as a string from the pg driver; the service casts.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  // The date this amount takes effect. Superseded by any later revision.
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
