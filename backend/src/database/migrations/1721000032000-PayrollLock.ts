import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.4: preview, lock, and approval before disbursement (FR-M4-07).
//
// A run is a recomputable draft until it locks. Locking freezes it: recompute
// and delete are refused, so the figures a reviewer approved are the figures
// that get paid. Approval routes through the shared workflow; a rejection
// returns the run to draft so it can be corrected and locked again.
//
// This is what makes D-09 enforceable: once a period is locked, a later
// attendance reversal cannot rewrite it and must flow as an off-cycle
// adjustment instead (FR-M4-11, FR-AT-41), which is T-2.5.
export class PayrollLock1721000032000 implements MigrationInterface {
  name = 'PayrollLock1721000032000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE payroll_runs
        ADD COLUMN status text NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'locked', 'approved')),
        ADD COLUMN locked_at timestamptz,
        ADD COLUMN locked_by text,
        ADD COLUMN approval_request_id uuid
          REFERENCES approval_requests(id) ON DELETE SET NULL,
        ADD COLUMN approved_at timestamptz
    `);
    // A locked run must record when and by whom, or the freeze is not auditable.
    await q.query(`
      ALTER TABLE payroll_runs
        ADD CONSTRAINT payroll_runs_locked_at_required
        CHECK (status = 'draft' OR locked_at IS NOT NULL)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE payroll_runs
        DROP CONSTRAINT IF EXISTS payroll_runs_locked_at_required,
        DROP COLUMN IF EXISTS approved_at,
        DROP COLUMN IF EXISTS approval_request_id,
        DROP COLUMN IF EXISTS locked_by,
        DROP COLUMN IF EXISTS locked_at,
        DROP COLUMN IF EXISTS status
    `);
  }
}
