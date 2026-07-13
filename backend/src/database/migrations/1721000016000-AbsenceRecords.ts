import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1C.10: absence records produced by the scheduled absence-detection job
// (FR-AT-19). One record per employee per day, marking an assigned working day
// with no check-in and no approved leave, holiday, or rest day. Reversible
// (regularization, T-1C.11). Tenant-scoped by RLS.
export class AbsenceRecords1721000016000 implements MigrationInterface {
  name = 'AbsenceRecords1721000016000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE absence_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
        absence_date date NOT NULL,
        reversed_at timestamptz,
        reversed_by text,
        reversal_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, employee_id, absence_date)
      )
    `);
    await q.query(
      `CREATE INDEX idx_absence_records_tenant ON absence_records(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_absence_records_employee ON absence_records(employee_id)`,
    );

    await q.query(`ALTER TABLE absence_records ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE absence_records FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON absence_records
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS absence_records`);
  }
}
