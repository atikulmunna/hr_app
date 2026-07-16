import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1E.3: shift-swap requests (FR-M2-02). An employee offers one of their future
// roster entries in exchange for a teammate's, routed through the shared
// workflow to the manager. On approval the two roster entries exchange owners
// (materialized lazily and idempotently, guarded by applied_at, mirroring the
// regularization precedent). Tenant-scoped by RLS.
export class ShiftSwap1721000023000 implements MigrationInterface {
  name = 'ShiftSwap1721000023000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE shift_swap_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requester_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        requester_entry_id uuid NOT NULL REFERENCES roster_entries(id) ON DELETE CASCADE,
        counterparty_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        counterparty_entry_id uuid NOT NULL REFERENCES roster_entries(id) ON DELETE CASCADE,
        reason text,
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        applied_at timestamptz,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_shift_swap_requester ON shift_swap_requests(requester_employee_id)`,
    );
    await q.query(
      `CREATE INDEX idx_shift_swap_counterparty ON shift_swap_requests(counterparty_employee_id)`,
    );

    await q.query(`ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE shift_swap_requests FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON shift_swap_requests
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS shift_swap_requests`);
  }
}
