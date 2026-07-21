import { MigrationInterface, QueryRunner } from 'typeorm';

// T-3.2: performance management (FR-M6-01, FR-M6-02, FR-M6-05, FR-M6-06).
//
// Goals and OKRs can cascade (a goal points at a parent goal) and track progress
// (FR-M6-01). A review cycle is configurable by type and period and carries a
// rating scale (FR-M6-02). Each employee in an active cycle gets an appraisal:
// the employee self-rates, the manager rates, and HR sets a final rating during
// calibration, viewing the rating distribution to normalize (FR-M6-05). An
// appraisal outcome (promotion, increment, PIP) captures development areas for
// L&D and, for an increment, applies a compensation raise so future payroll runs
// pay the new salary (FR-M6-06).
//
// The Could-priority 360 feedback (FR-M6-03) and continuous 1:1 notes (FR-M6-04)
// are deferred.
export class Performance1721000038000 implements MigrationInterface {
  name = 'Performance1721000038000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Rating scales: the ordered points a rating is chosen from. A default
    // 5-point scale is seeded lazily by the service (no tenant at migration time).
    await q.query(`
      CREATE TABLE rating_scales (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        points jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_rating_scales_name ON rating_scales(tenant_id, name)`,
    );

    // --- Review cycles: configurable appraisal windows (FR-M6-02).
    await q.query(`
      CREATE TABLE review_cycles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        cycle_type text NOT NULL DEFAULT 'annual'
          CHECK (cycle_type IN ('annual', 'quarterly', 'probation')),
        period_start date NOT NULL,
        period_end date NOT NULL,
        rating_scale_id uuid NOT NULL REFERENCES rating_scales(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'active', 'calibration', 'closed')),
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- Goals / OKRs: cascade via parent_goal_id, track a 0..100 progress
    // (FR-M6-01). cycle_id is optional so a goal can live outside a cycle.
    await q.query(`
      CREATE TABLE goals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        cycle_id uuid REFERENCES review_cycles(id) ON DELETE SET NULL,
        parent_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
        title text NOT NULL,
        description text,
        weight numeric(5, 2) CHECK (weight IS NULL OR weight >= 0),
        progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
        status text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'achieved', 'missed', 'cancelled')),
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_goals_employee ON goals(employee_id)`);
    await q.query(`CREATE INDEX idx_goals_cycle ON goals(cycle_id)`);

    // --- Appraisals: one per employee per cycle. Self, manager, and final
    // (calibrated) ratings are separate so calibration can adjust the outcome
    // without losing the inputs (FR-M6-05).
    await q.query(`
      CREATE TABLE appraisals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        cycle_id uuid NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        self_rating integer,
        self_comments text,
        manager_rating integer,
        manager_comments text,
        final_rating integer,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'self_review', 'manager_review', 'calibrated', 'closed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_appraisals_cycle_employee
         ON appraisals(cycle_id, employee_id)`,
    );

    // --- Outcomes: promotion, increment, or PIP, plus development areas for L&D.
    // An increment applies a compensation raise (FR-M6-06); compensation_applied
    // guards against paying it twice.
    await q.query(`
      CREATE TABLE appraisal_outcomes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        appraisal_id uuid NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
        outcome_type text NOT NULL DEFAULT 'none'
          CHECK (outcome_type IN ('none', 'promotion', 'increment', 'pip')),
        increment_amount numeric(14, 2) CHECK (increment_amount IS NULL OR increment_amount > 0),
        increment_effective_date date,
        new_job_title text,
        development_areas text,
        compensation_applied boolean NOT NULL DEFAULT false,
        applied_at timestamptz,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_appraisal_outcomes_appraisal
         ON appraisal_outcomes(appraisal_id)`,
    );

    for (const table of [
      'rating_scales',
      'review_cycles',
      'goals',
      'appraisals',
      'appraisal_outcomes',
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
    await q.query(`DROP TABLE IF EXISTS appraisal_outcomes`);
    await q.query(`DROP TABLE IF EXISTS appraisals`);
    await q.query(`DROP TABLE IF EXISTS goals`);
    await q.query(`DROP TABLE IF EXISTS review_cycles`);
    await q.query(`DROP TABLE IF EXISTS rating_scales`);
  }
}
