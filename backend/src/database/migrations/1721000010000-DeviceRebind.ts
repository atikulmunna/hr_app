import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1B.3: approval-gated re-bind history (FR-DB-06, FR-DB-09).
// An append-only log of every binding action (enroll, retire, rebind) with the
// reason code, the approval request that authorised it, and the acting user.
// Prior bindings are never deleted (PR-05); this table is the audit trail that
// also feeds re-bind frequency detection (T-1B.4). Tenant-scoped by RLS.
export class DeviceRebind1721000010000 implements MigrationInterface {
  name = 'DeviceRebind1721000010000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE device_binding_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
        action text NOT NULL CHECK (action IN ('enroll','retire','rebind')),
        reason_code text,
        request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        actor_sub text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_device_history_tenant ON device_binding_history(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_device_history_employee ON device_binding_history(employee_id, created_at DESC)`,
    );

    await q.query(
      `ALTER TABLE device_binding_history ENABLE ROW LEVEL SECURITY`,
    );
    await q.query(
      `ALTER TABLE device_binding_history FORCE ROW LEVEL SECURITY`,
    );
    await q.query(`
      CREATE POLICY tenant_isolation ON device_binding_history
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS device_binding_history`);
  }
}
