import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1D.1: leave types and policy binding (FR-M3-01, FR-M3-02), plus per-region
// holiday calendars (FR-M3-07) that later feed the absence job (FR-AT-19).
// A null legal_entity_id means the row applies to every entity in the tenant;
// a set value binds the policy or holiday to that entity. Tenant-scoped by RLS.
export class LeaveConfig1721000013000 implements MigrationInterface {
  name = 'LeaveConfig1721000013000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE leave_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE CASCADE,
        code text NOT NULL,
        name text NOT NULL,
        annual_quota numeric(5,1) NOT NULL DEFAULT 0,
        carry_forward_cap numeric(5,1) NOT NULL DEFAULT 0,
        notice_days int NOT NULL DEFAULT 0,
        paid boolean NOT NULL DEFAULT true,
        encashable boolean NOT NULL DEFAULT false,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, legal_entity_id, code)
      )
    `);
    await q.query(
      `CREATE INDEX idx_leave_types_tenant ON leave_types(tenant_id)`,
    );

    await q.query(`
      CREATE TABLE holidays (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE CASCADE,
        holiday_date date NOT NULL,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_holidays_tenant ON holidays(tenant_id)`);
    await q.query(
      `CREATE INDEX idx_holidays_date ON holidays(tenant_id, holiday_date)`,
    );

    for (const table of ['leave_types', 'holidays']) {
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
    await q.query(`DROP TABLE IF EXISTS holidays`);
    await q.query(`DROP TABLE IF EXISTS leave_types`);
  }
}
