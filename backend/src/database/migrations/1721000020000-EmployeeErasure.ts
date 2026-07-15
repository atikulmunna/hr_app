import { MigrationInterface, QueryRunner } from 'typeorm';

// T-1F.2: mark an employee whose personal data has been erased on a
// data-subject request (FR-M13-04, DR-04). PII on the row is anonymized;
// transactional and audit records are retained under statutory hold. erased_at
// records when the erasure happened.
export class EmployeeErasure1721000020000 implements MigrationInterface {
  name = 'EmployeeErasure1721000020000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE employees ADD COLUMN erased_at timestamptz`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE employees DROP COLUMN IF EXISTS erased_at`);
  }
}
