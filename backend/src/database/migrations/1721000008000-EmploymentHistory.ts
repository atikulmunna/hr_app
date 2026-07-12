import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1A.3: employment history timeline (M1, FR-M1-03).
// An append-only record of meaningful employment changes (transfers, role
// changes, status changes), tenant-scoped by RLS. Rows are written by the
// employee service when a tracked field changes.
export class EmploymentHistory1721000008000 implements MigrationInterface {
  name = 'EmploymentHistory1721000008000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE employment_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        effective_date date NOT NULL DEFAULT current_date,
        change_type text NOT NULL
          CHECK (change_type IN ('hired','transfer','role_change','status_change')),
        department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
        manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        job_title text,
        employment_type text,
        status text,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_employment_history_tenant ON employment_history(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_employment_history_employee ON employment_history(employee_id, effective_date DESC)`,
    );

    await q.query(`ALTER TABLE employment_history ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE employment_history FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON employment_history
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS employment_history`);
  }
}
