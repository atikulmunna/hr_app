import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1E.1: employee self-service profile edits (FR-M9-01). Non-sensitive contact
// fields are edited directly; a sensitive change (name) is submitted as a change
// request that routes through the shared workflow to HR and is applied to the
// employee record on approval (materialized idempotently, guarded by applied_at,
// like the leave/regularization/swap precedents). Tenant-scoped by RLS.
export class ProfileChangeRequests1721000025000 implements MigrationInterface {
  name = 'ProfileChangeRequests1721000025000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE profile_change_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        changes jsonb NOT NULL,
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        applied_at timestamptz,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_profile_change_requests_employee
         ON profile_change_requests(employee_id)`,
    );

    await q.query(
      `ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY`,
    );
    await q.query(
      `ALTER TABLE profile_change_requests FORCE ROW LEVEL SECURITY`,
    );
    await q.query(`
      CREATE POLICY tenant_isolation ON profile_change_requests
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS profile_change_requests`);
  }
}
