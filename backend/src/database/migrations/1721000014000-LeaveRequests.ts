import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1D.2: leave requests (FR-M3-03, FR-M3-05). A request records the dates and
// the working days (weekends and holidays excluded) and links to an
// approval_request in the shared workflow engine; its effective status is that
// approval's status. Tenant-scoped by RLS.
export class LeaveRequests1721000014000 implements MigrationInterface {
  name = 'LeaveRequests1721000014000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE leave_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
        start_date date NOT NULL,
        end_date date NOT NULL,
        working_days numeric(5,1) NOT NULL,
        reason text,
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_leave_requests_tenant ON leave_requests(tenant_id)`,
    );
    await q.query(
      `CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id)`,
    );

    await q.query(`ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY`);
    await q.query(`ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON leave_requests
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS leave_requests`);
  }
}
