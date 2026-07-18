import { MigrationInterface, QueryRunner } from 'typeorm';

// Separation-of-duties escalation (O-09, FR-M3-05, PR-05).
//
// The self-approval guard blocks anyone deciding their own request. That can
// strand a request whose only structural approver is the person who raised it,
// e.g. a manager filing their own leave (routed to the manager role) or an HR
// admin filing their own profile change (routed to hr_admin).
//
// escalatable marks exactly those requests: it is true when the requester holds
// an approver role for the request, so self-approval would otherwise be
// possible. Such requests may additionally be decided by the escalation role
// (the COO / tenant_admin). Ordinary requests, where the requester does not hold
// the approver role, are untouched: they keep their normal hierarchy and the COO
// never sees them.
export class ApprovalEscalation1721000033000 implements MigrationInterface {
  name = 'ApprovalEscalation1721000033000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE approval_requests
        ADD COLUMN escalatable boolean NOT NULL DEFAULT false
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE approval_requests DROP COLUMN IF EXISTS escalatable`,
    );
  }
}
