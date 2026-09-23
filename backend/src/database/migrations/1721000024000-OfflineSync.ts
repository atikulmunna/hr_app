import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.7: offline capture and sync. Events captured while offline are queued on
// the device and synced later. client_id is a device-generated idempotency key
// so re-syncing the same event never double-inserts (FR-AT-22, NFR-S-05).
// synced_at records when the server received it, distinct from server_ts which
// keeps the client capture time (server-adjusted; FR-AT-18, FR-AT-20).
export class OfflineSync1721000024000 implements MigrationInterface {
  name = 'OfflineSync1721000024000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE attendance_events ADD COLUMN client_id text`);
    await q.query(
      `ALTER TABLE attendance_events ADD COLUMN synced_at timestamptz`,
    );
    // Dedup key: one event per client_id per tenant, only for offline marks.
    await q.query(
      `CREATE UNIQUE INDEX idx_attendance_events_client_id
         ON attendance_events(tenant_id, client_id)
         WHERE client_id IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_attendance_events_client_id`);
    await q.query(
      `ALTER TABLE attendance_events DROP COLUMN IF EXISTS synced_at`,
    );
    await q.query(
      `ALTER TABLE attendance_events DROP COLUMN IF EXISTS client_id`,
    );
  }
}
