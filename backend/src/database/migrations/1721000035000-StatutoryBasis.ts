import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.3 follow-up: the period a statutory rule's thresholds are expressed in.
//
// A run values one period (a month), but income tax is defined on annual
// income: brackets and any ceiling are yearly figures. Applying an annual
// bracket to a monthly base under-charges (a monthly salary sits inside the
// annual tax-free band). basis = 'annual' tells the engine to annualize the base
// (x12), compute, then divide the charge back to the period, which is the
// standard monthly-TDS approach.
//
// A provident fund or a CPF-style contribution is a monthly figure (its ceiling
// is a monthly wage cap), so those stay 'monthly', the default.
export class StatutoryBasis1721000035000 implements MigrationInterface {
  name = 'StatutoryBasis1721000035000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE statutory_rules
        ADD COLUMN basis text NOT NULL DEFAULT 'monthly'
          CHECK (basis IN ('monthly', 'annual'))
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE statutory_rules DROP COLUMN IF EXISTS basis`);
  }
}
