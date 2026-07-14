import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.11: attendance regularization requests (Section 7.1, FR-AT-32 to
// FR-AT-35, PR-07). An employee (or an admin on their behalf) requests a missed
// or corrected mark. A self-service request routes through the shared workflow
// engine; on approval it materializes real attendance_events with a non-live
// origin, so a corrected mark is always distinguishable from a live scored one.
// Tenant-scoped by RLS.
export class Regularizations1721000017000 implements MigrationInterface {
  name = 'Regularizations1721000017000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE regularization_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        target_date date NOT NULL,
        correction_type text NOT NULL
          CHECK (correction_type IN ('missing_check_in', 'missing_check_out', 'both')),
        requested_check_in timestamptz,
        requested_check_out timestamptz,
        reason text NOT NULL,
        origin text NOT NULL DEFAULT 'self_service'
          CHECK (origin IN ('self_service', 'admin', 'import')),
        created_by_sub text,
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        applied_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_regularizations_tenant ON regularization_requests(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_regularizations_employee ON regularization_requests(employee_id)`,
    );

    await q.query(
      `ALTER TABLE regularization_requests ENABLE ROW LEVEL SECURITY`,
    );
    await q.query(
      `ALTER TABLE regularization_requests FORCE ROW LEVEL SECURITY`,
    );
    await q.query(`
      CREATE POLICY tenant_isolation ON regularization_requests
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS regularization_requests`);
  }
}
