import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.2 (O-07): approval-gated payable overtime (FR-M2-06).
//
// Overtime is derived from worked duration beyond the assigned shift, but the
// derived figure is not payable on its own: it must be approved first. A row
// here is a claim for a date's hours; its effective status is the linked
// approval's, so nothing needs materializing and a payroll run simply sums the
// approved hours in its period.
//
// source 'derived' is a claim against hours the summary actually derived for
// that day and is validated against it. 'declared' is the manual exception path
// FR-M2-06 also requires, for hours the marks did not capture.
//
// The OT multiplier is jurisdictional, like the proration basis (O-06), so it
// binds to the legal entity.
export class Overtime1721000029000 implements MigrationInterface {
  name = 'Overtime1721000029000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE overtime_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        work_date date NOT NULL,
        hours numeric(5, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
        source text NOT NULL DEFAULT 'derived'
          CHECK (source IN ('derived', 'declared')),
        reason text NOT NULL,
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_overtime_requests_employee_date
         ON overtime_requests(employee_id, work_date)`,
    );

    await q.query(`ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE overtime_requests FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON overtime_requests
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);

    await q.query(`
      ALTER TABLE legal_entities ADD COLUMN overtime_multiplier numeric(4, 2)
        NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier >= 1)
    `);
    // Bangladesh pays overtime at twice the ordinary rate.
    await q.query(
      `UPDATE legal_entities SET overtime_multiplier = 2.0 WHERE country_code = 'BD'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE legal_entities DROP COLUMN IF EXISTS overtime_multiplier`,
    );
    await q.query(`DROP TABLE IF EXISTS overtime_requests`);
  }
}
