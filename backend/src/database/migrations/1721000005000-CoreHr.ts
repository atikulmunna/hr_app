import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1A: core HR data model (M1).
// departments and the canonical employee profile, tenant-scoped by RLS.
export class CoreHr1721000005000 implements MigrationInterface {
  name = 'CoreHr1721000005000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
        name text NOT NULL,
        cost_center text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_departments_tenant ON departments(tenant_id)`,
    );

    await q.query(`
      CREATE TABLE employees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
        department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
        manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        keycloak_sub text,
        employee_code text NOT NULL,
        first_name text NOT NULL,
        last_name text NOT NULL,
        email text,
        phone text,
        job_title text,
        employment_type text NOT NULL DEFAULT 'permanent'
          CHECK (employment_type IN ('permanent','contract','probation','intern','consultant')),
        status text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','on_leave','terminated')),
        hire_date date,
        emergency_contact_name text,
        emergency_contact_phone text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, employee_code)
      )
    `);
    await q.query(`CREATE INDEX idx_employees_tenant ON employees(tenant_id)`);
    await q.query(
      `CREATE INDEX idx_employees_department ON employees(department_id)`,
    );
    // One Keycloak identity maps to at most one employee per tenant.
    await q.query(
      `CREATE UNIQUE INDEX idx_employees_tenant_sub ON employees(tenant_id, keycloak_sub) WHERE keycloak_sub IS NOT NULL`,
    );

    for (const table of ['departments', 'employees']) {
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
    await q.query(`DROP TABLE IF EXISTS employees`);
    await q.query(`DROP TABLE IF EXISTS departments`);
  }
}
