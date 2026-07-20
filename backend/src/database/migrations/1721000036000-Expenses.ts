import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.6: expense claims, category limits, approval, and settlement
// (FR-M8-01 to FR-M8-03).
//
// An employee builds a claim of one or more lines, each in an expense category
// and optionally carrying a receipt. Categories can set a per-line cap; a line
// over its cap is refused at submit, so a claim cannot enter approval already
// breaching policy (FR-M8-02). Submit routes the claim through the shared
// workflow engine to the employee's manager (FR-M8-03, FR-M11-01), reusing the
// same separation-of-duties and escalation as leave and overtime.
//
// Once approved, HR settles it one of two ways (FR-M8-03): "payroll" raises an
// approved off-cycle adjustment (T-2.5) so the amount lands on the next
// payslip, or "disbursement" records that it was paid out of band. Either way
// the claim is marked settled with the method and time, and the receipt bytes
// stay auditable.
export class Expenses1721000036000 implements MigrationInterface {
  name = 'Expenses1721000036000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Categories: the policy catalog. legal_entity_id NULL applies
    // tenant-wide; set scopes a category to one entity. limit_amount NULL means
    // no cap.
    await q.query(`
      CREATE TABLE expense_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE CASCADE,
        code text NOT NULL,
        name text NOT NULL,
        limit_amount numeric(14, 2) CHECK (limit_amount IS NULL OR limit_amount > 0),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_expense_categories_code
         ON expense_categories(tenant_id, code)`,
    );

    // --- Claims: a header owned by one employee, in their entity currency.
    await q.query(`
      CREATE TABLE expense_claims (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        title text NOT NULL,
        currency_code text NOT NULL,
        status text NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'settled', 'cancelled')),
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        -- How an approved claim was paid, and the trail if via payroll.
        settlement_method text
          CHECK (settlement_method IS NULL OR settlement_method IN ('payroll', 'disbursement')),
        adjustment_id uuid REFERENCES payroll_adjustments(id) ON DELETE SET NULL,
        settled_at timestamptz,
        submitted_at timestamptz,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_expense_claims_employee
         ON expense_claims(employee_id)`,
    );

    // --- Lines: the itemised spend. receipt is the uploaded file inline; the
    // repo has no object store, so the bytes live with the row (FR-M8-01).
    await q.query(`
      CREATE TABLE expense_claim_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        claim_id uuid NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
        category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
        expense_date date NOT NULL,
        description text NOT NULL,
        amount numeric(14, 2) NOT NULL CHECK (amount > 0),
        receipt bytea,
        receipt_filename text,
        receipt_mime text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_expense_claim_lines_claim
         ON expense_claim_lines(claim_id)`,
    );

    for (const table of [
      'expense_categories',
      'expense_claims',
      'expense_claim_lines',
    ]) {
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
    await q.query(`DROP TABLE IF EXISTS expense_claim_lines`);
    await q.query(`DROP TABLE IF EXISTS expense_claims`);
    await q.query(`DROP TABLE IF EXISTS expense_categories`);
  }
}
