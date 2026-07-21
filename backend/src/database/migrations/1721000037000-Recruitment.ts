import { MigrationInterface, QueryRunner } from 'typeorm';

// T-3.1: recruitment / ATS (FR-M5-01, FR-M5-03, FR-M5-05, FR-M5-06, FR-M5-07,
// and the click-to-sign side of FR-M1-09).
//
// A requisition is raised by HR and approved through the shared workflow engine
// (FR-M5-01, FR-M11-01). Once approved it accepts applications, each a candidate
// moving through a tenant-configurable, ordered pipeline of stages (FR-M5-03).
// Applications carry a source and optional referring employee for channel yield
// analysis (FR-M5-06). Interviews are scheduled against an application and each
// interviewer leaves a scorecard, so feedback is collaborative rather than a
// single verdict (FR-M5-05). An offer is generated as a letter, e-signed by the
// candidate as a click-to-sign audit record (typed name, timestamp, client IP,
// and a SHA-256 hash of the exact letter bytes so a later edit is detectable),
// and a signed offer converts the candidate into an employee record, the start
// of onboarding (FR-M5-07, FR-M1-09).
//
// The Could-priority career portal (FR-M5-02) and resume parsing (FR-M5-04) are
// deferred, so candidates are entered by HR rather than self-applying.
export class Recruitment1721000037000 implements MigrationInterface {
  name = 'Recruitment1721000037000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Pipeline stages: the tenant-configurable ordered funnel. A terminal
    // stage ends the pipeline; its outcome marks the application hired or
    // rejected. Defaults are seeded lazily by the service (the tenant does not
    // exist at migration time).
    await q.query(`
      CREATE TABLE pipeline_stages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        sort_order integer NOT NULL,
        is_terminal boolean NOT NULL DEFAULT false,
        outcome text CHECK (outcome IS NULL OR outcome IN ('hired', 'rejected')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_pipeline_stages_name ON pipeline_stages(tenant_id, name)`,
    );

    // --- Job requisitions: an approved headcount request to recruit against.
    await q.query(`
      CREATE TABLE job_requisitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
        department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
        title text NOT NULL,
        headcount integer NOT NULL DEFAULT 1 CHECK (headcount > 0),
        employment_type text NOT NULL DEFAULT 'permanent',
        description text,
        hiring_manager_sub text,
        status text NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'closed', 'filled')),
        approval_request_id uuid REFERENCES approval_requests(id) ON DELETE SET NULL,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- Applications: a candidate against a requisition, at a pipeline stage.
    // Candidate identity lives inline (no searchable candidate DB yet, FR-M5-04
    // deferred). source and referral_employee_id give channel yield (FR-M5-06).
    await q.query(`
      CREATE TABLE applications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requisition_id uuid NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
        candidate_name text NOT NULL,
        candidate_email text NOT NULL,
        candidate_phone text,
        source text NOT NULL DEFAULT 'direct'
          CHECK (source IN ('referral', 'job_board', 'agency', 'campus', 'direct', 'other')),
        referral_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
        status text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'hired', 'rejected', 'withdrawn')),
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_applications_requisition ON applications(requisition_id)`,
    );
    await q.query(
      `CREATE INDEX idx_applications_stage ON applications(stage_id)`,
    );

    // --- Interviews: a scheduled conversation for an application.
    await q.query(`
      CREATE TABLE interviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        scheduled_at timestamptz NOT NULL,
        mode text NOT NULL DEFAULT 'video'
          CHECK (mode IN ('onsite', 'phone', 'video')),
        interviewer_sub text,
        interviewer_name text,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_interviews_application ON interviews(application_id)`,
    );

    // --- Scorecards: one per reviewer per interview, so feedback is collaborative.
    await q.query(`
      CREATE TABLE interview_scorecards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
        reviewer_sub text NOT NULL,
        reviewer_name text,
        rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
        recommendation text NOT NULL
          CHECK (recommendation IN ('strong_yes', 'yes', 'no', 'strong_no')),
        comments text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_scorecards_reviewer
         ON interview_scorecards(interview_id, reviewer_sub)`,
    );

    // --- Offers: a generated letter, click-to-sign audit, and the employee it
    // converts into. document_hash is the SHA-256 of letter_body captured when
    // the offer is sent, so a signature is bound to the exact text signed.
    await q.query(`
      CREATE TABLE offers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        salary_amount numeric(14, 2) NOT NULL CHECK (salary_amount > 0),
        currency_code text NOT NULL,
        start_date date NOT NULL,
        letter_body text NOT NULL,
        document_hash text NOT NULL,
        status text NOT NULL DEFAULT 'sent'
          CHECK (status IN ('sent', 'signed', 'declined', 'rescinded')),
        signer_name text,
        signed_at timestamptz,
        signer_ip text,
        employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_offers_application ON offers(application_id)`,
    );

    for (const table of [
      'pipeline_stages',
      'job_requisitions',
      'applications',
      'interviews',
      'interview_scorecards',
      'offers',
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
    await q.query(`DROP TABLE IF EXISTS offers`);
    await q.query(`DROP TABLE IF EXISTS interview_scorecards`);
    await q.query(`DROP TABLE IF EXISTS interviews`);
    await q.query(`DROP TABLE IF EXISTS applications`);
    await q.query(`DROP TABLE IF EXISTS job_requisitions`);
    await q.query(`DROP TABLE IF EXISTS pipeline_stages`);
  }
}
