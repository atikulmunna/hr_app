import { MigrationInterface, QueryRunner } from 'typeorm';

// T-3.3: learning and development (FR-M7-03, FR-M7-04).
//
// A skill catalog holds the competencies a tenant tracks (FR-M7-03). Each role
// (the employee job title, since there is no separate positions table) can
// declare a required proficiency per skill in role_skills, and each employee
// records their actual proficiency in employee_skills. Together those form the
// skill matrix per role: columns are the role's skills, rows are its employees,
// and a cell below the required level is a gap.
//
// Certifications (FR-M7-04) carry an optional expiry. Status (valid / expiring /
// expired) is computed on read; reminder_sent_at guards the lazy reminder so an
// expiring certification notifies HR and the employee only once.
//
// The Could-priority course catalog (FR-M7-01), content types (FR-M7-02), and
// compliance report (FR-M7-05) are deferred.
export class Learning1721000039000 implements MigrationInterface {
  name = 'Learning1721000039000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Skill catalog: the competencies a tenant tracks.
    await q.query(`
      CREATE TABLE skills (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        category text,
        description text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_skills_name ON skills(tenant_id, lower(name))`,
    );

    // --- Required proficiency per role. role is the employee job title.
    await q.query(`
      CREATE TABLE role_skills (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        role text NOT NULL,
        skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        required_level integer NOT NULL CHECK (required_level BETWEEN 1 AND 5),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_role_skills_role_skill
         ON role_skills(tenant_id, lower(role), skill_id)`,
    );

    // --- An employee's actual proficiency in a skill (the matrix cells).
    await q.query(`
      CREATE TABLE employee_skills (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        level integer NOT NULL CHECK (level BETWEEN 1 AND 5),
        assessed_on date,
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_employee_skills_employee_skill
         ON employee_skills(employee_id, skill_id)`,
    );

    // --- Certifications with an optional expiry and one-shot reminder guard.
    await q.query(`
      CREATE TABLE certifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        name text NOT NULL,
        issuer text,
        credential_id text,
        issued_on date,
        expires_on date,
        reminder_sent_at timestamptz,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_certifications_employee ON certifications(employee_id)`,
    );
    await q.query(
      `CREATE INDEX idx_certifications_expires ON certifications(expires_on)`,
    );

    for (const table of [
      'skills',
      'role_skills',
      'employee_skills',
      'certifications',
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
    await q.query(`DROP TABLE IF EXISTS certifications`);
    await q.query(`DROP TABLE IF EXISTS employee_skills`);
    await q.query(`DROP TABLE IF EXISTS role_skills`);
    await q.query(`DROP TABLE IF EXISTS skills`);
  }
}
