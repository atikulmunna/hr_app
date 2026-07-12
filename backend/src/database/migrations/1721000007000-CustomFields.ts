import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1A.2: tenant-configurable custom fields for the employee record (M1).
// Definitions are per tenant (RLS); values live in a JSONB column on employees
// and are validated against the active definitions on write.
export class CustomFields1721000007000 implements MigrationInterface {
  name = 'CustomFields1721000007000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE custom_field_definitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        field_key text NOT NULL,
        label text NOT NULL,
        field_type text NOT NULL
          CHECK (field_type IN ('text','number','date','boolean','select')),
        options jsonb,
        required boolean NOT NULL DEFAULT false,
        active boolean NOT NULL DEFAULT true,
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, field_key)
      )
    `);
    await q.query(
      `CREATE INDEX idx_custom_field_defs_tenant ON custom_field_definitions(tenant_id)`,
    );

    await q.query(
      `ALTER TABLE employees ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );

    await q.query(
      `ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY`,
    );
    await q.query(
      `ALTER TABLE custom_field_definitions FORCE ROW LEVEL SECURITY`,
    );
    await q.query(`
      CREATE POLICY tenant_isolation ON custom_field_definitions
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE employees DROP COLUMN IF EXISTS custom_fields`);
    await q.query(`DROP TABLE IF EXISTS custom_field_definitions`);
  }
}
