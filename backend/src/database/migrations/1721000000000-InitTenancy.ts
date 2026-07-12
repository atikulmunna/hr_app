import { MigrationInterface, QueryRunner } from 'typeorm';

// T-0.3: multi-tenant data foundation.
// Creates tenants and legal_entities, and enforces tenant isolation on
// legal_entities via Postgres row-level security keyed on the
// app.current_tenant_id session setting (see TenantDbService).
export class InitTenancy1721000000000 implements MigrationInterface {
  name = 'InitTenancy1721000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await q.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE legal_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        country_code text NOT NULL,
        currency_code text NOT NULL,
        residency_region text NOT NULL DEFAULT 'default',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_legal_entities_tenant ON legal_entities(tenant_id)`,
    );

    // Row-level security. FORCE so the table owner is also subject to policy.
    // current_setting(..., true) returns NULL when unset, which yields no rows.
    await q.query(`ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE legal_entities FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON legal_entities
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS legal_entities`);
    await q.query(`DROP TABLE IF EXISTS tenants`);
  }
}
