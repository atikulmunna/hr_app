import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.9: shift definitions and per-employee assignment (FR-M2-01). A shift
// carries the expected working window, an unpaid break, and a grace period for
// late detection (FR-M2-08). One assigned shift per employee (reassign
// replaces); assigning the same shift to many employees covers group schedules.
// Tenant-scoped by RLS.
export class Shifts1721000015000 implements MigrationInterface {
  name = 'Shifts1721000015000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE shifts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE CASCADE,
        name text NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        break_minutes int NOT NULL DEFAULT 0,
        grace_minutes int NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_shifts_tenant ON shifts(tenant_id)`);

    await q.query(`
      CREATE TABLE employee_shifts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, employee_id)
      )
    `);
    await q.query(
      `CREATE INDEX idx_employee_shifts_tenant ON employee_shifts(tenant_id)`,
    );

    for (const table of ['shifts', 'employee_shifts']) {
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
    await q.query(`DROP TABLE IF EXISTS employee_shifts`);
    await q.query(`DROP TABLE IF EXISTS shifts`);
  }
}
