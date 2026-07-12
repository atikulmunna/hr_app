import { MigrationInterface, QueryRunner } from 'typeorm';

// T-0.5: append-only audit spine (PR-05).
// Tenant-scoped by row-level security. The app role may SELECT and INSERT but
// not UPDATE or DELETE, so entries are immutable at the database level.
export class AuditLog1721000002000 implements MigrationInterface {
  name = 'AuditLog1721000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        actor_sub text,
        actor_username text,
        action text NOT NULL,
        resource_type text,
        resource_id text,
        "before" jsonb,
        "after" jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC)`,
    );

    await q.query(`ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON audit_logs
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);

    // Append-only: grant read and insert, revoke mutation from the app role.
    await q.query(`GRANT SELECT, INSERT ON audit_logs TO hris_app`);
    await q.query(`REVOKE UPDATE, DELETE ON audit_logs FROM hris_app`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS audit_logs`);
  }
}
