import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.2: per-employee geofence sets and the remote label (FR-AT-28, FR-AT-31).
// A join table assigns named geofences to an employee; a mark passes if it is
// inside any assigned fence. Employees with no assignment fall back to their
// group (legal-entity or tenant-wide) fences. Marks recorded outside all fences
// under the remote-allowed policy are labelled remote. Tenant-scoped by RLS.
export class EmployeeGeofences1721000011000 implements MigrationInterface {
  name = 'EmployeeGeofences1721000011000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE employee_geofences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        geofence_id uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, employee_id, geofence_id)
      )
    `);
    await q.query(
      `CREATE INDEX idx_employee_geofences_tenant ON employee_geofences(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_employee_geofences_employee ON employee_geofences(employee_id)`,
    );

    await q.query(`ALTER TABLE employee_geofences ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE employee_geofences FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON employee_geofences
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);

    await q.query(
      `ALTER TABLE attendance_events ADD COLUMN remote boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE attendance_events DROP COLUMN IF EXISTS remote`);
    await q.query(`DROP TABLE IF EXISTS employee_geofences`);
  }
}
