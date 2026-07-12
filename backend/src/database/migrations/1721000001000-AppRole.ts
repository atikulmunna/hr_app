import { MigrationInterface, QueryRunner } from 'typeorm';

// T-0.3: dedicated runtime role for the application.
// The migration/owner role (hris) is a superuser and bypasses row-level
// security. The app must connect as a non-superuser, non-owner role so RLS
// is actually enforced. Dev password is set here for local convenience; in
// real environments the password is managed as a secret.
export class AppRole1721000001000 implements MigrationInterface {
  name = 'AppRole1721000001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hris_app') THEN
          CREATE ROLE hris_app LOGIN PASSWORD 'hris_app_pw';
        END IF;
      END
      $$;
    `);
    await q.query(`GRANT USAGE ON SCHEMA public TO hris_app`);
    await q.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hris_app`,
    );
    await q.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hris_app`,
    );
    // Future tables created by the owner are granted to hris_app automatically.
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris_app`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hris_app`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM hris_app`,
    );
    await q.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM hris_app`,
    );
    await q.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM hris_app`,
    );
    await q.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hris_app`);
    await q.query(`REVOKE USAGE ON SCHEMA public FROM hris_app`);
    await q.query(`DROP ROLE IF EXISTS hris_app`);
  }
}
