import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.5: off-cycle payroll adjustments (FR-M4-11, FR-AT-24, FR-AT-40, FR-AT-41).
//
// A locked run is immutable (T-2.4). When a correction lands after a period is
// locked, e.g. a counted mark is rejected, the fix is an explicit off-cycle
// adjustment settled into the next run, never a rewrite of the closed one
// (D-09). The adjustment is the recorded delta with a reason and actor
// (FR-AT-24), signed: positive pays more, negative claws back.
//
// It is approved like a run (separation of duties), then a later run picks up
// approved, unsettled adjustments for its in-scope employees, adds them to net,
// and marks them settled. A draft run may un-settle and re-pick-up on recompute;
// once its run locks, the settlement is frozen with it.
//
// The amount is entered, not computed: attendance does not drive base pay in
// this system yet, so there is no delta to derive automatically. That coupling
// (unpaid-absence deductions) is a prerequisite for an automatic trigger.
export class PayrollAdjustments1721000034000 implements MigrationInterface {
  name = 'PayrollAdjustments1721000034000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payroll_adjustments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        reason text NOT NULL,
        amount numeric(14, 2) NOT NULL CHECK (amount <> 0),
        currency_code text NOT NULL,
        -- The locked run this corrects, kept for traceability (FR-AT-41). Null
        -- for a standalone off-cycle payment.
        source_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'settled', 'rejected', 'cancelled')),
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        -- The run that paid it out. Set when settled; cleared if that draft run
        -- is recomputed or deleted before it locks.
        settled_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_payroll_adjustments_employee
         ON payroll_adjustments(employee_id)`,
    );
    // The lookup the run makes: approved, unsettled, for an entity.
    await q.query(`
      CREATE INDEX idx_payroll_adjustments_pickup
        ON payroll_adjustments(legal_entity_id, status)
        WHERE settled_run_id IS NULL
    `);

    await q.query(`ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE payroll_adjustments FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON payroll_adjustments
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);

    // A run's total settled adjustments, so net = gross - deductions + this.
    await q.query(`
      ALTER TABLE payroll_run_employees
        ADD COLUMN adjustments numeric(14, 2) NOT NULL DEFAULT 0
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE payroll_run_employees DROP COLUMN IF EXISTS adjustments`,
    );
    await q.query(`DROP TABLE IF EXISTS payroll_adjustments`);
  }
}
