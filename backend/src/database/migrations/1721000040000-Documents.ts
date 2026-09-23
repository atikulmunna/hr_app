import { MigrationInterface, QueryRunner } from 'typeorm';

// T-3.4 (documents slice): employee documents with version history and access
// control (FR-M1-07), expiry tracking with reminders (FR-M1-08), and e-signature
// for letters and policy acknowledgements (FR-M1-09).
//
// A document carries metadata and a visibility level; the bytes live outside the
// database, so each version records a client-supplied SHA-256 rather than the
// file itself. document_versions is the version history; document_acknowledgements
// is the e-signature: a typed name, the acknowledged hash, and the signer IP,
// captured the same way the recruitment offer is signed. Expiry reminders fire
// lazily on read, reusing the pattern from certifications (T-3.3).
//
// The org chart (FR-M1-06), on/offboarding checklists (FR-M1-10), and asset
// tracking (FR-M1-11) are a separate follow-up.
export class Documents1721000040000 implements MigrationInterface {
  name = 'Documents1721000040000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Documents. employee_id is null for org-wide documents (e.g. a policy);
    // visibility is the access-control dimension (FR-M1-07).
    await q.query(`
      CREATE TABLE documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
        name text NOT NULL,
        category text NOT NULL DEFAULT 'other',
        doc_type text,
        visibility text NOT NULL DEFAULT 'hr_only'
          CHECK (visibility IN ('hr_only', 'employee', 'all')),
        requires_acknowledgement boolean NOT NULL DEFAULT false,
        current_version integer NOT NULL DEFAULT 1,
        expires_on date,
        reminder_sent_at timestamptz,
        created_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX idx_documents_employee ON documents(employee_id)`,
    );
    await q.query(
      `CREATE INDEX idx_documents_expires ON documents(expires_on)`,
    );

    // --- Version history: each version is an immutable metadata record with the
    // file's SHA-256 (FR-M1-07). The document points at its current version.
    await q.query(`
      CREATE TABLE document_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        version integer NOT NULL,
        sha256 text NOT NULL,
        note text,
        uploaded_by_sub text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_document_versions_doc_version
         ON document_versions(document_id, version)`,
    );

    // --- Acknowledgements: the e-signature over a specific version (FR-M1-09).
    await q.query(`
      CREATE TABLE document_acknowledgements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        version integer NOT NULL,
        signer_sub text NOT NULL,
        signer_name text NOT NULL,
        sha256 text NOT NULL,
        signer_ip text,
        signed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX idx_document_acks_doc_signer_version
         ON document_acknowledgements(document_id, signer_sub, version)`,
    );

    for (const table of [
      'documents',
      'document_versions',
      'document_acknowledgements',
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
    await q.query(`DROP TABLE IF EXISTS document_acknowledgements`);
    await q.query(`DROP TABLE IF EXISTS document_versions`);
    await q.query(`DROP TABLE IF EXISTS documents`);
  }
}
