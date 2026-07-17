import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.3: statutory deductions per jurisdiction (FR-M4-06).
//
// Rates are law, they differ per jurisdiction, and they change most years, so
// they are configurable data bound to the legal entity and effective-dated. A
// run resolves the rules in force at its cut-off, so a June run keeps using
// June's rates after a January change lands.
//
// Two calculations cover the named cases:
//   percentage: rate on the base, optionally capped by a monthly wage ceiling
//               (provident fund, contributions)
//   bracket:    progressive slabs over the base (income tax)
//
// Employee amounts are deductions and reduce net pay. Employer amounts do not:
// they are a cost of employment, recorded for cost-to-company (FR-M10-01).
//
// Deliberately not modelled yet: rules conditional on age or residency status,
// which Singapore's CPF needs. The employee record has neither date of birth nor
// residency status, so such a rule cannot be computed correctly and is better
// absent than wrong.
export class StatutoryRules1721000031000 implements MigrationInterface {
  name = 'StatutoryRules1721000031000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE statutory_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
        code text NOT NULL,
        name text NOT NULL,
        calculation text NOT NULL
          CHECK (calculation IN ('percentage', 'bracket')),
        base text NOT NULL DEFAULT 'gross' CHECK (base IN ('basic', 'gross')),
        employee_rate numeric(6, 3) NOT NULL DEFAULT 0
          CHECK (employee_rate >= 0 AND employee_rate <= 100),
        employer_rate numeric(6, 3) NOT NULL DEFAULT 0
          CHECK (employer_rate >= 0 AND employer_rate <= 100),
        -- Caps the base a percentage applies to, as CPF's ordinary wage ceiling
        -- does. Null means uncapped.
        wage_ceiling numeric(14, 2)
          CHECK (wage_ceiling IS NULL OR wage_ceiling > 0),
        effective_from date NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, legal_entity_id, code, effective_from)
      )
    `);
    await q.query(`
      CREATE INDEX idx_statutory_rules_as_of
        ON statutory_rules(legal_entity_id, code, effective_from DESC)
    `);

    // Progressive slabs for a 'bracket' rule. upper_bound null is the top slab.
    await q.query(`
      CREATE TABLE statutory_brackets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rule_id uuid NOT NULL REFERENCES statutory_rules(id) ON DELETE CASCADE,
        lower_bound numeric(14, 2) NOT NULL CHECK (lower_bound >= 0),
        upper_bound numeric(14, 2)
          CHECK (upper_bound IS NULL OR upper_bound > lower_bound),
        rate numeric(6, 3) NOT NULL CHECK (rate >= 0 AND rate <= 100),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_statutory_brackets_rule
         ON statutory_brackets(rule_id, lower_bound)`,
    );

    for (const table of ['statutory_rules', 'statutory_brackets']) {
      await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await q.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await q.query(`
        CREATE POLICY tenant_isolation ON ${table}
          USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
          WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      `);
    }

    // Distinguishes a computed statutory deduction from a catalog component, so
    // a payslip can show them apart and a run stays explainable.
    await q.query(`
      ALTER TABLE payroll_run_lines
        ADD COLUMN source text NOT NULL DEFAULT 'component'
          CHECK (source IN ('component', 'statutory'))
    `);
    // Employer-side statutory cost for the period. Not a deduction: it never
    // touches net, it is what the employer owes on top (FR-M10-01).
    await q.query(`
      ALTER TABLE payroll_run_employees
        ADD COLUMN employer_contributions numeric(14, 2) NOT NULL DEFAULT 0
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE payroll_run_employees DROP COLUMN IF EXISTS employer_contributions`,
    );
    await q.query(`ALTER TABLE payroll_run_lines DROP COLUMN IF EXISTS source`);
    await q.query(`DROP TABLE IF EXISTS statutory_brackets`);
    await q.query(`DROP TABLE IF EXISTS statutory_rules`);
  }
}
