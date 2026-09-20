import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { RosterEntry } from '../../entities/roster-entry.entity';
import { ShiftSwapRequest } from '../../entities/shift-swap-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { ApprovalView, WorkflowService } from '../workflow/workflow.service';

const SWAP_APPROVER_ROLES = ['manager'];

export interface SwapInput {
  requesterEntryId?: string;
  counterpartyEntryId?: string;
  reason?: string;
}

// Shift-swap requests (T-1E.3, FR-M2-02). An employee offers one of their future
// roster entries in exchange for a teammate's. On manager approval the two
// entries exchange owners, in the deciding transaction.
@Injectable()
export class SwapService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly workflow: WorkflowService,
  ) {
    this.workflow.onDecided('shift_swap', (view, m) => this.onDecided(view, m));
  }

  async request(user: AuthUser, input: SwapInput) {
    if (!input.requesterEntryId || !input.counterpartyEntryId) {
      throw new BadRequestException(
        'requesterEntryId and counterpartyEntryId are required.',
      );
    }
    const employee = await this.employees.myProfile(user.sub, user.email);

    return this.db.withTenant(async (m) => {
      const mine = await m.findOne(RosterEntry, {
        where: { id: input.requesterEntryId },
      });
      if (!mine || mine.employeeId !== employee.id) {
        throw new BadRequestException('You can only offer your own roster day.');
      }
      const theirs = await m.findOne(RosterEntry, {
        where: { id: input.counterpartyEntryId },
      });
      if (!theirs) {
        throw new NotFoundException('The teammate roster day was not found.');
      }
      if (theirs.employeeId === employee.id) {
        throw new BadRequestException("Pick a teammate's day, not your own.");
      }
      assertFuture(mine.workDate);
      assertFuture(theirs.workDate);
      await this.assertNoOpenSwap(m, mine.id, theirs.id);
      await this.assertNoConflict(m, mine, theirs);
      const counterpartyEmployeeId = theirs.employeeId;
      const myDate = mine.workDate.slice(0, 10);
      const theirDate = theirs.workDate.slice(0, 10);

      const approval = await this.workflow.createRequest(
        {
          requestType: 'shift_swap',
          resourceType: 'roster',
          payload: {
            requesterEmployeeId: employee.id,
            counterpartyEmployeeId,
            requesterDate: myDate,
            counterpartyDate: theirDate,
          },
          approverRoles: SWAP_APPROVER_ROLES,
        },
        m,
      );

      const saved = await m.save(
        m.create(ShiftSwapRequest, {
          tenantId: this.db.tenantId,
          requesterEmployeeId: employee.id,
          requesterEntryId: input.requesterEntryId,
          counterpartyEmployeeId,
          counterpartyEntryId: input.counterpartyEntryId,
          reason: input.reason?.trim() || undefined,
          createdBy: user.sub,
          approvalRequestId: approval.request.id,
        }),
      );
      await this.audit.record(
        {
          action: 'shift_swap.request',
          resourceType: 'shift_swap_request',
          resourceId: saved.id,
          after: { counterpartyEmployeeId, requesterDate: myDate, counterpartyDate: theirDate },
        },
        m,
      );
      return saved;
    });
  }

  myRequests(user: AuthUser): Promise<unknown[]> {
    return this.employees
      .myProfile(user.sub, user.email)
      .then((employee) => this.listInvolving(employee.id));
  }

  async listInvolving(employeeId: string): Promise<unknown[]> {
    return this.db.withTenant((m) =>
      m.query(
        `SELECT s.id,
                s.requester_employee_id AS "requesterEmployeeId",
                s.counterparty_employee_id AS "counterpartyEmployeeId",
                req.first_name || ' ' || req.last_name AS "requesterName",
                cp.first_name || ' ' || cp.last_name AS "counterpartyName",
                to_char(re.work_date, 'YYYY-MM-DD') AS "requesterDate",
                to_char(ce.work_date, 'YYYY-MM-DD') AS "counterpartyDate",
                rs.name AS "requesterShift", cs.name AS "counterpartyShift",
                s.reason, s.applied_at AS "appliedAt", s.created_at AS "createdAt",
                COALESCE(ar.status, 'pending') AS "status"
         FROM shift_swap_requests s
         JOIN employees req ON req.id = s.requester_employee_id
         JOIN employees cp ON cp.id = s.counterparty_employee_id
         JOIN roster_entries re ON re.id = s.requester_entry_id
         JOIN roster_entries ce ON ce.id = s.counterparty_entry_id
         JOIN shifts rs ON rs.id = re.shift_id
         JOIN shifts cs ON cs.id = ce.shift_id
         LEFT JOIN approval_requests ar ON ar.id = s.approval_request_id
         WHERE s.requester_employee_id = $1 OR s.counterparty_employee_id = $1
         ORDER BY s.created_at DESC`,
        [employeeId],
      ),
    );
  }

  // Exchanges the two roster days once the manager approves. A rejection leaves
  // the roster untouched; the request's status is read from the approval.
  private async onDecided(view: ApprovalView, m: EntityManager): Promise<void> {
    if (view.request.status !== 'approved') {
      return;
    }
    const swap = await m.findOne(ShiftSwapRequest, {
      where: { approvalRequestId: view.request.id },
    });
    if (swap && !swap.appliedAt) {
      await this.apply(m, swap);
    }
  }

  private async apply(m: EntityManager, swap: ShiftSwapRequest): Promise<void> {
    const mine = await m.findOne(RosterEntry, {
      where: { id: swap.requesterEntryId },
    });
    const theirs = await m.findOne(RosterEntry, {
      where: { id: swap.counterpartyEntryId },
    });
    if (mine && theirs) {
      const requesterOwner = mine.employeeId;
      mine.employeeId = theirs.employeeId;
      theirs.employeeId = requesterOwner;
      mine.source = 'swap';
      theirs.source = 'swap';
      // The unique (employee, date) constraint is deferrable, so exchanging the
      // two owners commits atomically.
      await m.save([mine, theirs]);
    }
    swap.appliedAt = new Date();
    await m.save(swap);
    await this.audit.record(
      {
        action: 'shift_swap.apply',
        resourceType: 'shift_swap_request',
        resourceId: swap.id,
        after: { applied: mine != null && theirs != null },
      },
      m,
    );
  }

  private async assertNoOpenSwap(
    m: EntityManager,
    requesterEntryId: string,
    counterpartyEntryId: string,
  ): Promise<void> {
    const rows = await m.query(
      `SELECT count(*)::int AS n FROM shift_swap_requests s
       LEFT JOIN approval_requests ar ON ar.id = s.approval_request_id
       WHERE s.applied_at IS NULL
         AND COALESCE(ar.status, 'pending') <> 'rejected'
         AND (s.requester_entry_id IN ($1, $2)
              OR s.counterparty_entry_id IN ($1, $2))`,
      [requesterEntryId, counterpartyEntryId],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      throw new BadRequestException(
        'One of these days already has an open swap request.',
      );
    }
  }

  // Guards against a third-party unique clash: after the swap each employee must
  // not already have a roster entry on the date they are receiving.
  private async assertNoConflict(
    m: EntityManager,
    mine: RosterEntry,
    theirs: RosterEntry,
  ): Promise<void> {
    const counterpartyClash = await m.query(
      `SELECT 1 FROM roster_entries
       WHERE employee_id = $1 AND work_date = $2 AND id <> $3 LIMIT 1`,
      [theirs.employeeId, mine.workDate, theirs.id],
    );
    const requesterClash = await m.query(
      `SELECT 1 FROM roster_entries
       WHERE employee_id = $1 AND work_date = $2 AND id <> $3 LIMIT 1`,
      [mine.employeeId, theirs.workDate, mine.id],
    );
    if (counterpartyClash.length > 0 || requesterClash.length > 0) {
      throw new BadRequestException(
        'One of you is already rostered on the other day.',
      );
    }
  }
}

function assertFuture(workDate: string): void {
  const today = new Date().toISOString().slice(0, 10);
  if (workDate.slice(0, 10) <= today) {
    throw new BadRequestException('You can only swap upcoming roster days.');
  }
}
