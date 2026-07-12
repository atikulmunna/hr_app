import { MigrationInterface, QueryRunner } from 'typeorm';

// T-0.7: in-app notifications (FR-M11-04, FR-M9-05).
// A notification targets either a specific user (recipient_sub) or anyone
// holding a role (recipient_role). Tenant-scoped by row-level security.
export class Notifications1721000004000 implements MigrationInterface {
  name = 'Notifications1721000004000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        recipient_sub text,
        recipient_role text,
        type text NOT NULL,
        title text NOT NULL,
        body text,
        data jsonb,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT notifications_recipient_present
          CHECK (recipient_sub IS NOT NULL OR recipient_role IS NOT NULL)
      )
    `);
    await q.query(
      `CREATE INDEX idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC)`,
    );

    await q.query(`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE notifications FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON notifications
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS notifications`);
  }
}
