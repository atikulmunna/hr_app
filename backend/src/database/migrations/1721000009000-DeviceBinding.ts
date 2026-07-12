import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1B.1/1B.2: device binding and enrollment (M-DB).
// One active device per employee (partial unique index); attendance events
// carry the device they were marked from. Tenant-scoped by RLS.
export class DeviceBinding1721000009000 implements MigrationInterface {
  name = 'DeviceBinding1721000009000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        device_fingerprint text NOT NULL,
        platform text,
        model text,
        status text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','retired')),
        bound_at timestamptz NOT NULL DEFAULT now(),
        retired_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_devices_tenant ON devices(tenant_id)`);
    await q.query(`CREATE INDEX idx_devices_employee ON devices(employee_id)`);
    // Enforce exactly one active device per employee (O-01).
    await q.query(
      `CREATE UNIQUE INDEX idx_devices_one_active ON devices(tenant_id, employee_id) WHERE status = 'active'`,
    );

    await q.query(`ALTER TABLE devices ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE devices FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON devices
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);

    await q.query(
      `ALTER TABLE attendance_events ADD COLUMN device_id uuid REFERENCES devices(id) ON DELETE SET NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE attendance_events DROP COLUMN IF EXISTS device_id`,
    );
    await q.query(`DROP TABLE IF EXISTS devices`);
  }
}
