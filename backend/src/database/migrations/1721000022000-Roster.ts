import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1E.3: per-date roster. A roster entry assigns a specific shift to an
// employee on a specific date, overriding the standing employee_shifts
// assignment for that day (FR-M2-02). One entry per employee per day. Source
// records whether it was set manually or produced by an approved shift swap.
// Tenant-scoped by RLS.
export class Roster1721000022000 implements MigrationInterface {
  name = 'Roster1721000022000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE roster_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        work_date date NOT NULL,
        source text NOT NULL DEFAULT 'manual',
        note text,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        -- Deferrable so an approved shift swap can exchange two entries' owners
        -- within one transaction; uniqueness is enforced at commit.
        UNIQUE (tenant_id, employee_id, work_date) DEFERRABLE INITIALLY DEFERRED
      )
    `);
    await q.query(
      `CREATE INDEX idx_roster_entries_employee_date
         ON roster_entries(employee_id, work_date)`,
    );

    await q.query(`ALTER TABLE roster_entries ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE roster_entries FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON roster_entries
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS roster_entries`);
  }
}
