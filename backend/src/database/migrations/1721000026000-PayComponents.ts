import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.1: configurable pay components (FR-M4-01) and multi-currency pay across
// legal entities (FR-M4-03).
//
// pay_components is the tenant's catalog of what can appear on a payslip. A row
// with legal_entity_id NULL applies tenant-wide; setting it scopes the component
// to one entity, so a jurisdiction-specific allowance stays out of another
// entity's structure.
//
// employee_pay_components holds the per-employee amount for a catalog component.
// Each row carries its currency_code: pay is denominated in the employee's legal
// entity currency, which is what makes payroll multi-currency across entities.
// The amount is always positive; component_type decides whether it adds to gross
// or subtracts as a deduction.
export class PayComponents1721000026000 implements MigrationInterface {
  name = 'PayComponents1721000026000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE pay_components (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE CASCADE,
        code text NOT NULL,
        name text NOT NULL,
        component_type text NOT NULL
          CHECK (component_type IN ('basic', 'allowance', 'bonus', 'deduction')),
        taxable boolean NOT NULL DEFAULT true,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, code)
      )
    `);
    await q.query(
      `CREATE INDEX idx_pay_components_tenant ON pay_components(tenant_id)`,
    );

    await q.query(`
      CREATE TABLE employee_pay_components (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        pay_component_id uuid NOT NULL
          REFERENCES pay_components(id) ON DELETE RESTRICT,
        amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
        currency_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, employee_id, pay_component_id)
      )
    `);
    await q.query(
      `CREATE INDEX idx_employee_pay_components_employee
         ON employee_pay_components(employee_id)`,
    );

    for (const table of ['pay_components', 'employee_pay_components']) {
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
    await q.query(`DROP TABLE IF EXISTS employee_pay_components`);
    await q.query(`DROP TABLE IF EXISTS pay_components`);
  }
}
