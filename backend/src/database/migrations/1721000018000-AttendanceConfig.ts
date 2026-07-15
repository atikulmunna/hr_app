import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.12: per-tenant attendance configuration (FR-AT-15, FR-AT-16). One row
// per tenant holds the scoring and banding knobs so a tenant can tune signal
// weights, thresholds, the score ceiling, the accuracy limit, the critical and
// co-occurrence sets, promote soft signals to hard blocks, and set the offline
// trust window and an optional marking window, all without redeployment. A
// tenant with no row uses the documented defaults. Tenant-scoped by RLS.
export class AttendanceConfig1721000018000 implements MigrationInterface {
  name = 'AttendanceConfig1721000018000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE attendance_config (
        tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        weights jsonb NOT NULL DEFAULT '{}',
        yellow_threshold int NOT NULL DEFAULT 30,
        red_threshold int NOT NULL DEFAULT 60,
        score_ceiling int NOT NULL DEFAULT 100,
        accuracy_limit_m int NOT NULL DEFAULT 100,
        critical_signals text[] NOT NULL
          DEFAULT ARRAY['hooking_framework', 'signature_mismatch'],
        cooccurrence_threshold int NOT NULL DEFAULT 2,
        hard_block_signals text[] NOT NULL DEFAULT '{}',
        offline_window_hours int NOT NULL DEFAULT 12,
        marking_start time,
        marking_end time,
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`ALTER TABLE attendance_config ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE attendance_config FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON attendance_config
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS attendance_config`);
  }
}
