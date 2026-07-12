import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C: attendance events and geofences (SRS section 5).
// Each check-in, check-out, or break is a server-stamped, scored event.
export class Attendance1721000006000 implements MigrationInterface {
  name = 'Attendance1721000006000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE employees ADD COLUMN remote_allowed boolean NOT NULL DEFAULT false`,
    );

    await q.query(`
      CREATE TABLE geofences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE CASCADE,
        name text NOT NULL,
        latitude double precision NOT NULL,
        longitude double precision NOT NULL,
        radius_m integer NOT NULL DEFAULT 200,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_geofences_tenant ON geofences(tenant_id)`);

    await q.query(`
      CREATE TABLE attendance_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        event_type text NOT NULL
          CHECK (event_type IN ('check_in','check_out','break_start','break_end')),
        server_ts timestamptz NOT NULL DEFAULT now(),
        origin text NOT NULL DEFAULT 'live'
          CHECK (origin IN ('live','regularized','admin','offline')),
        lat double precision,
        lng double precision,
        accuracy_m double precision,
        is_mock boolean,
        provider text,
        wifi_bssid text,
        ip text,
        vpn_active boolean,
        rooted boolean,
        emulator boolean,
        hooking_framework boolean,
        adb_enabled boolean,
        dev_options_enabled boolean,
        app_signature_valid boolean,
        matched_geofence_id uuid,
        geofence_pass boolean,
        risk_score integer NOT NULL DEFAULT 0,
        band text NOT NULL DEFAULT 'clean'
          CHECK (band IN ('clean','yellow','red')),
        app_version text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_attendance_employee_ts ON attendance_events(tenant_id, employee_id, server_ts DESC)`,
    );

    for (const table of ['geofences', 'attendance_events']) {
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
    await q.query(`DROP TABLE IF EXISTS attendance_events`);
    await q.query(`DROP TABLE IF EXISTS geofences`);
    await q.query(`ALTER TABLE employees DROP COLUMN IF EXISTS remote_allowed`);
  }
}
