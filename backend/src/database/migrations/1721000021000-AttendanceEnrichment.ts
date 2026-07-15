import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.5: async enrichment. A mark is scored synchronously from its payload,
// then a background pass adds signals that cannot be computed inline (impossible
// travel between consecutive marks, IP-geolocation mismatch) and re-bands
// (PR-06, NFR-P-03). enrichment_status lets review views show "score pending".
// Existing rows are marked done so the sweep does not reprocess them.
export class AttendanceEnrichment1721000021000 implements MigrationInterface {
  name = 'AttendanceEnrichment1721000021000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE attendance_events
         ADD COLUMN enrichment_status text NOT NULL DEFAULT 'pending'`,
    );
    await q.query(
      `ALTER TABLE attendance_events
         ADD COLUMN enrichment_signals text[] NOT NULL DEFAULT '{}'`,
    );
    await q.query(`UPDATE attendance_events SET enrichment_status = 'done'`);
    await q.query(
      `CREATE INDEX idx_attendance_events_enrichment
         ON attendance_events(enrichment_status) WHERE enrichment_status = 'pending'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_attendance_events_enrichment`);
    await q.query(
      `ALTER TABLE attendance_events DROP COLUMN IF EXISTS enrichment_signals`,
    );
    await q.query(
      `ALTER TABLE attendance_events DROP COLUMN IF EXISTS enrichment_status`,
    );
  }
}
