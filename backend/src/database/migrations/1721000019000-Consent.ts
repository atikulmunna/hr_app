import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1F.1: consent capture and purpose statements (Section 9.1, FR-M13-01,
// FR-M13-02, FR-M13-05). A tenant publishes a versioned, per-platform
// plain-language purpose statement describing which signals are collected and
// why; an employee grants consent to the active version before marking. Both
// tables are tenant-scoped by RLS.
export class Consent1721000019000 implements MigrationInterface {
  name = 'Consent1721000019000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE consent_statements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        platform text NOT NULL CHECK (platform IN ('android', 'ios')),
        version int NOT NULL,
        body text NOT NULL,
        signals text[] NOT NULL DEFAULT '{}',
        active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, platform, version)
      )
    `);
    // At most one active statement per tenant and platform.
    await q.query(
      `CREATE UNIQUE INDEX idx_consent_active ON consent_statements(tenant_id, platform)
         WHERE active`,
    );
    await q.query(`ALTER TABLE consent_statements ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE consent_statements FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON consent_statements
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);

    await q.query(`
      CREATE TABLE consent_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        statement_id uuid NOT NULL REFERENCES consent_statements(id) ON DELETE CASCADE,
        platform text NOT NULL,
        version int NOT NULL,
        scope text[] NOT NULL DEFAULT '{}',
        granted_at timestamptz NOT NULL DEFAULT now(),
        withdrawn_at timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX idx_consent_records_employee ON consent_records(employee_id, platform)`,
    );
    await q.query(`ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE consent_records FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON consent_records
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS consent_records`);
    await q.query(`DROP TABLE IF EXISTS consent_statements`);
  }
}
