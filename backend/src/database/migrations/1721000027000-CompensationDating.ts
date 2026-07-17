import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.2 groundwork: effective-dated compensation and the per-entity proration
// basis (FR-M4-05, FR-AT-39).
//
// Payroll consumes data "as of a defined cut-off", which an undated amount
// cannot answer. effective_from turns employee_pay_components into a revision
// history: a run values an employee at the row in force on the cut-off, so
// running July's payroll in August (after an August raise is entered) still pays
// the July rate, and a back-dated raise can be resolved for arrears.
//
// The read rule is "greatest effective_from <= as-of". effective_to is derived
// from the next revision rather than stored, so there is no pair of rows to keep
// consistent.
//
// proration_basis differs by jurisdiction for an incomplete month of work, so it
// binds to the legal entity like other policy (FR-M3-02, FR-M4-06).
export class CompensationDating1721000027000 implements MigrationInterface {
  name = 'CompensationDating1721000027000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE employee_pay_components ADD COLUMN effective_from date`);
    // Existing rows have always been in force, so date them from their creation.
    await q.query(
      `UPDATE employee_pay_components SET effective_from = created_at::date`,
    );
    await q.query(
      `ALTER TABLE employee_pay_components ALTER COLUMN effective_from SET NOT NULL`,
    );

    // One amount per component per effective date; a new date is a new revision.
    await q.query(`
      ALTER TABLE employee_pay_components
        DROP CONSTRAINT employee_pay_components_tenant_id_employee_id_pay_component_key
    `);
    await q.query(`
      ALTER TABLE employee_pay_components
        ADD CONSTRAINT employee_pay_components_revision_key
        UNIQUE (tenant_id, employee_id, pay_component_id, effective_from)
    `);
    await q.query(`
      CREATE INDEX idx_employee_pay_components_as_of
        ON employee_pay_components(employee_id, pay_component_id, effective_from DESC)
    `);

    await q.query(`
      ALTER TABLE legal_entities ADD COLUMN proration_basis text NOT NULL
        DEFAULT 'calendar_days'
        CHECK (proration_basis IN ('calendar_days', 'working_days'))
    `);
    // Singapore prescribes a working-day basis for an incomplete month of work.
    await q.query(
      `UPDATE legal_entities SET proration_basis = 'working_days' WHERE country_code = 'SG'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE legal_entities DROP COLUMN IF EXISTS proration_basis`);
    await q.query(`DROP INDEX IF EXISTS idx_employee_pay_components_as_of`);
    await q.query(`
      ALTER TABLE employee_pay_components
        DROP CONSTRAINT IF EXISTS employee_pay_components_revision_key
    `);
    await q.query(`ALTER TABLE employee_pay_components DROP COLUMN IF EXISTS effective_from`);
    await q.query(`
      ALTER TABLE employee_pay_components
        ADD CONSTRAINT employee_pay_components_tenant_id_employee_id_pay_component_key
        UNIQUE (tenant_id, employee_id, pay_component_id)
    `);
  }
}
