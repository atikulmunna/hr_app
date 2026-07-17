import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.2: payroll runs with attendance/leave/OT intake as of a data cut-off
// (FR-M4-04, FR-M4-05, FR-AT-39).
//
// A run belongs to one legal entity, because pay is denominated in the entity
// currency and prorated on the entity basis. Compensation is valued as of
// cutoff_date; intake covers the whole period and is refreshed on recompute,
// since data landing after the cut-off but before lock still belongs to this run
// (FR-AT-39). Post-lock corrections become off-cycle adjustments (D-09), which
// is T-2.5.
//
// payroll_run_lines snapshot the component code, name, type, and amount used.
// That snapshot, not the dating on employee_pay_components, is what keeps a
// closed run immutable (FR-AT-41): editing the catalog or a salary later cannot
// rewrite what a past run paid.
//
// There is no status column yet; every run is a recomputable draft until T-2.4
// adds preview, lock, and approval.
export class PayrollRuns1721000028000 implements MigrationInterface {
  name = 'PayrollRuns1721000028000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payroll_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
        period_start date NOT NULL,
        period_end date NOT NULL,
        cutoff_date date NOT NULL,
        run_type text NOT NULL DEFAULT 'monthly'
          CHECK (run_type IN ('monthly', 'off_cycle')),
        currency_code text NOT NULL,
        proration_basis text NOT NULL,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (period_end >= period_start)
      )
    `);
    // One monthly run per entity per period; off-cycle runs may repeat.
    await q.query(`
      CREATE UNIQUE INDEX idx_payroll_runs_monthly_period
        ON payroll_runs(tenant_id, legal_entity_id, period_start, period_end)
        WHERE run_type = 'monthly'
    `);

    await q.query(`
      CREATE TABLE payroll_run_employees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        currency_code text NOT NULL,
        payable_days integer NOT NULL,
        period_days integer NOT NULL,
        proration_factor numeric(6, 4) NOT NULL,
        present_days integer NOT NULL DEFAULT 0,
        absent_days integer NOT NULL DEFAULT 0,
        leave_days integer NOT NULL DEFAULT 0,
        worked_hours numeric(8, 2) NOT NULL DEFAULT 0,
        -- Recorded as intake only. Payable overtime is gated on approval
        -- (FR-M2-06), which is not built, so no hours are payable yet (O-07).
        overtime_hours numeric(8, 2) NOT NULL DEFAULT 0,
        overtime_amount numeric(14, 2) NOT NULL DEFAULT 0,
        gross numeric(14, 2) NOT NULL DEFAULT 0,
        deductions numeric(14, 2) NOT NULL DEFAULT 0,
        net numeric(14, 2) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, run_id, employee_id)
      )
    `);
    await q.query(
      `CREATE INDEX idx_payroll_run_employees_run ON payroll_run_employees(run_id)`,
    );

    await q.query(`
      CREATE TABLE payroll_run_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        -- Kept for traceability, but the run does not depend on it: the code,
        -- name, and type below are snapshots, so a later catalog edit or
        -- deletion cannot rewrite what this run paid.
        pay_component_id uuid REFERENCES pay_components(id) ON DELETE SET NULL,
        code text NOT NULL,
        name text NOT NULL,
        component_type text NOT NULL,
        base_amount numeric(14, 2) NOT NULL,
        proration_factor numeric(6, 4) NOT NULL,
        amount numeric(14, 2) NOT NULL,
        currency_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_payroll_run_lines_run ON payroll_run_lines(run_id, employee_id)`,
    );

    for (const table of [
      'payroll_runs',
      'payroll_run_employees',
      'payroll_run_lines',
    ]) {
      await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await q.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await q.query(`
        CREATE POLICY tenant_isolation ON ${table}
          USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
          WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS payroll_run_lines`);
    await q.query(`DROP TABLE IF EXISTS payroll_run_employees`);
    await q.query(`DROP TABLE IF EXISTS payroll_runs`);
  }
}
