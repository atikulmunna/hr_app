import { MigrationInterface, QueryRunner } from 'typeorm';

// T-0.6: shared multi-level approval engine (FR-M11-01).
// One engine consumed by leave, expense, requisition, attendance
// regularization, and device re-bind. Tenant-scoped by row-level security.
export class Workflow1721000003000 implements MigrationInterface {
  name = 'Workflow1721000003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE approval_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        request_type text NOT NULL,
        resource_type text,
        resource_id text,
        requester_sub text,
        status text NOT NULL DEFAULT 'pending',
        current_step int NOT NULL DEFAULT 1,
        payload jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_approval_requests_tenant_status ON approval_requests(tenant_id, status)`,
    );

    await q.query(`
      CREATE TABLE approval_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
        step_order int NOT NULL,
        approver_role text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        decided_by_sub text,
        decided_at timestamptz,
        comment text,
        UNIQUE (request_id, step_order)
      )
    `);
    await q.query(
      `CREATE INDEX idx_approval_steps_request ON approval_steps(request_id)`,
    );

    for (const table of ['approval_requests', 'approval_steps']) {
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
    await q.query(`DROP TABLE IF EXISTS approval_steps`);
    await q.query(`DROP TABLE IF EXISTS approval_requests`);
  }
}
