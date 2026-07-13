import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.8: attendance review queue (FR-AT-10 to FR-AT-14). A review case is
// opened for a flagged mark (Red band or co-occurring high-confidence signals),
// one per event, and worked by HR (accept/reject/adjust). Tenant-scoped by RLS.
export class ReviewCases1721000012000 implements MigrationInterface {
  name = 'ReviewCases1721000012000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE review_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        event_id uuid NOT NULL UNIQUE REFERENCES attendance_events(id) ON DELETE CASCADE,
        reason text NOT NULL,
        signals jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'accepted', 'rejected', 'adjusted')),
        resolution_note text,
        resolved_by text,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_review_cases_tenant ON review_cases(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_review_cases_status ON review_cases(status)`,
    );
    await q.query(
      `CREATE INDEX idx_review_cases_employee ON review_cases(employee_id)`,
    );

    await q.query(`ALTER TABLE review_cases ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE review_cases FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON review_cases
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS review_cases`);
  }
}
