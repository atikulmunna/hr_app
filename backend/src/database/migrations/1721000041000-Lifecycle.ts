import { MigrationInterface, QueryRunner } from 'typeorm';

// T-3.4b (lifecycle slice): on/offboarding checklists with cross-role task
// assignment (FR-M1-10). The org chart (FR-M1-06) needs no table: it is derived
// from employees.manager_id on read.
//
// checklist_template_items is the tenant's template, one ordered list per kind
// (onboarding, offboarding); a default set is seeded lazily on first use. Opening
// a checklist for an employee copies the template into checklist_items with each
// item's due date resolved from its offset, so later template edits never
// rewrite a checklist already in progress. Each item is owed by a role (the
// employee, their manager, or HR), which is what lets the three parties see and
// tick off their own tasks.
//
// Asset allocation and access revocation (FR-M1-11, Could) are deferred.
export class Lifecycle1721000041000 implements MigrationInterface {
  name = 'Lifecycle1721000041000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE checklist_template_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('onboarding', 'offboarding')),
        title text NOT NULL,
        assignee_role text NOT NULL,
        due_offset_days integer NOT NULL DEFAULT 0,
        sort_order integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_checklist_template_items_kind
         ON checklist_template_items(tenant_id, kind, sort_order)`,
    );

    // --- One checklist per employee per lifecycle event. Only one may be open
    // per kind at a time, so re-triggering (a second termination edit) is a
    // no-op rather than a duplicate.
    await q.query(`
      CREATE TABLE checklists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('onboarding', 'offboarding')),
        status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete')),
        anchor_date date NOT NULL,
        opened_by_sub text,
        opened_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_checklists_open_per_kind
         ON checklists(employee_id, kind) WHERE status = 'open'`,
    );
    await q.query(`CREATE INDEX idx_checklists_status ON checklists(tenant_id, status)`);

    await q.query(`
      CREATE TABLE checklist_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
        title text NOT NULL,
        assignee_role text NOT NULL,
        due_on date,
        sort_order integer NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
        note text,
        completed_by_sub text,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_checklist_items_checklist
         ON checklist_items(checklist_id, sort_order)`,
    );
    await q.query(
      `CREATE INDEX idx_checklist_items_pending_role
         ON checklist_items(tenant_id, assignee_role) WHERE status = 'pending'`,
    );

    for (const table of ['checklist_template_items', 'checklists', 'checklist_items']) {
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
    await q.query(`DROP TABLE IF EXISTS checklist_items`);
    await q.query(`DROP TABLE IF EXISTS checklists`);
    await q.query(`DROP TABLE IF EXISTS checklist_template_items`);
  }
}
