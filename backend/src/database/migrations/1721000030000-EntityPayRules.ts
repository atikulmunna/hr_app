import { MigrationInterface, QueryRunner } from 'typeorm';

// T-2.2 (O-08): the overtime rate is company and jurisdiction policy, so it is
// configurable per legal entity rather than hardcoded.
//
// The rate is always base / divisor x multiplier. Only three things vary, and
// between them they express the real statutory formulas exactly:
//
//   Singapore (MOM Part IV): basic / 190.67 x 1.5
//     where 190.67 = (52 weeks x 44 hours) / 12 months
//   Bangladesh:              basic / 208 x 2.0
//   Shift-derived:           basic / (shift hours x working days) x multiplier
//
// A fixed divisor also sidesteps the Sat/Sun rest-day assumption still baked
// into the working-day count (deferred in T-1C.9), which would otherwise skew
// the rate wherever the weekend is not Sat/Sun.
export class EntityPayRules1721000030000 implements MigrationInterface {
  name = 'EntityPayRules1721000030000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE legal_entities
        ADD COLUMN overtime_base text NOT NULL DEFAULT 'basic'
          CHECK (overtime_base IN ('basic', 'gross')),
        ADD COLUMN overtime_divisor text NOT NULL DEFAULT 'expected_hours'
          CHECK (overtime_divisor IN ('expected_hours', 'fixed_hours')),
        ADD COLUMN overtime_fixed_hours numeric(6, 2)
          CHECK (overtime_fixed_hours IS NULL OR overtime_fixed_hours > 0)
    `);
    // A fixed divisor needs its hours; the pair must be coherent. Named
    // explicitly: the inline CHECK above already takes the default
    // legal_entities_overtime_divisor_check name.
    await q.query(`
      ALTER TABLE legal_entities
        ADD CONSTRAINT legal_entities_overtime_fixed_hours_required
        CHECK (overtime_divisor <> 'fixed_hours' OR overtime_fixed_hours IS NOT NULL)
    `);

    // Seed each entity with its jurisdiction's formula.
    await q.query(`
      UPDATE legal_entities
         SET overtime_divisor = 'fixed_hours', overtime_fixed_hours = 190.67
       WHERE country_code = 'SG'
    `);
    await q.query(`
      UPDATE legal_entities
         SET overtime_divisor = 'fixed_hours', overtime_fixed_hours = 208
       WHERE country_code = 'BD'
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE legal_entities
        DROP CONSTRAINT IF EXISTS legal_entities_overtime_fixed_hours_required,
        DROP COLUMN IF EXISTS overtime_fixed_hours,
        DROP COLUMN IF EXISTS overtime_divisor,
        DROP COLUMN IF EXISTS overtime_base
    `);
  }
}
