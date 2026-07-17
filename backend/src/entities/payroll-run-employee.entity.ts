import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One employee's result within a run: the intake pulled for the period and the
// totals computed from it (T-2.2). Numeric columns come back as strings from the
// pg driver, so reads go through SQL casts in the service rather than this
// entity.
@Entity('payroll_run_employees')
export class PayrollRunEmployee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'run_id' })
  runId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  // Days the employee was employed within the period, and the period's total,
  // both counted on the entity's proration basis.
  @Column({ name: 'payable_days' })
  payableDays: number;

  @Column({ name: 'period_days' })
  periodDays: number;

  @Column({ name: 'proration_factor', type: 'numeric', precision: 6, scale: 4 })
  prorationFactor: string;

  @Column({ name: 'present_days' })
  presentDays: number;

  @Column({ name: 'absent_days' })
  absentDays: number;

  @Column({ name: 'leave_days' })
  leaveDays: number;

  @Column({ name: 'worked_hours', type: 'numeric', precision: 8, scale: 2 })
  workedHours: string;

  // Intake only: payable overtime is gated on approval (FR-M2-06), which is not
  // built, so overtimeAmount stays 0 (O-07).
  @Column({ name: 'overtime_hours', type: 'numeric', precision: 8, scale: 2 })
  overtimeHours: string;

  @Column({ name: 'overtime_amount', type: 'numeric', precision: 14, scale: 2 })
  overtimeAmount: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  gross: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  deductions: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  net: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
