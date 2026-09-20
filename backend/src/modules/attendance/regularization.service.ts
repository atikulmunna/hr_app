import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { AttendanceEvent } from '../../entities/attendance-event.entity';
import {
  CorrectionType,
  RegularizationOrigin,
  RegularizationRequest,
} from '../../entities/regularization-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { ApprovalView, WorkflowService } from '../workflow/workflow.service';

const REGULARIZATION_APPROVER_ROLES = ['manager'];
// Per-employee rolling rate limit (FR-AT-34). Tenant-configurable with T-1C.12;
// a sensible default until then.
const RATE_LIMIT_WINDOW_DAYS = 30;
const RATE_LIMIT_MAX = 5;

const CORRECTION_TYPES: CorrectionType[] = [
  'missing_check_in',
  'missing_check_out',
  'both',
];

export interface RegularizationInput {
  targetDate?: string;
  correctionType?: CorrectionType;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason?: string;
}

interface ValidatedInput {
  targetDate: string;
  correctionType: CorrectionType;
  checkIn: Date | null;
  checkOut: Date | null;
  reason: string;
}

@Injectable()
export class RegularizationService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly workflow: WorkflowService,
  ) {
    // An approved correction produces its counted marks the moment the manager
    // decides, in the same transaction.
    this.workflow.onDecided('regularization', (view, m) =>
      this.onDecided(view, m),
    );
  }

  // Self-service: route the correction through the shared workflow engine for
  // manager approval before it produces a counted mark (FR-AT-32).
  async request(user: AuthUser, input: RegularizationInput) {
    const employee = await this.employees.myProfile(user.sub, user.email);
    const valid = validate(input);

    return this.db.withTenant(async (m) => {
      await this.assertNoLiveMark(m, employee.id, valid);
      await this.assertRateLimit(m, employee.id);
      const approval = await this.workflow.createRequest(
        {
          requestType: 'regularization',
          resourceType: 'attendance',
          payload: {
            employeeId: employee.id,
            targetDate: valid.targetDate,
            correctionType: valid.correctionType,
          },
          approverRoles: REGULARIZATION_APPROVER_ROLES,
        },
        m,
      );
      const saved = await m.save(
        m.create(RegularizationRequest, {
          tenantId: this.db.tenantId,
          employeeId: employee.id,
          targetDate: valid.targetDate,
          correctionType: valid.correctionType,
          requestedCheckIn: valid.checkIn ?? undefined,
          requestedCheckOut: valid.checkOut ?? undefined,
          reason: valid.reason,
          origin: 'self_service',
          createdBySub: user.sub,
          approvalRequestId: approval.request.id,
        }),
      );
      await this.audit.record(
        {
          action: 'attendance.regularization_request',
          resourceType: 'regularization_request',
          resourceId: saved.id,
          after: {
            targetDate: valid.targetDate,
            correctionType: valid.correctionType,
          },
        },
        m,
      );
      return saved;
    });
  }

  // Admin insert: applied immediately with origin = admin, attributed to the
  // acting admin, never recorded as live (FR-AT-35). No approval step.
  async adminInsert(
    employeeId: string,
    input: RegularizationInput,
    actorSub: string | undefined,
  ) {
    const valid = validate(input);
    return this.db.withTenant(async (m) => {
      const exists = await m.query(
        `SELECT 1 FROM employees WHERE id = $1`,
        [employeeId],
      );
      if (exists.length === 0) {
        throw new NotFoundException('Employee not found.');
      }
      await this.assertNoLiveMark(m, employeeId, valid);
      const saved = await m.save(
        m.create(RegularizationRequest, {
          tenantId: this.db.tenantId,
          employeeId,
          targetDate: valid.targetDate,
          correctionType: valid.correctionType,
          requestedCheckIn: valid.checkIn ?? undefined,
          requestedCheckOut: valid.checkOut ?? undefined,
          reason: valid.reason,
          origin: 'admin',
          createdBySub: actorSub,
        }),
      );
      await this.materialize(m, saved, 'admin', actorSub);
      return saved;
    });
  }

  myRequests(user: AuthUser): Promise<unknown[]> {
    return this.employees
      .myProfile(user.sub, user.email)
      .then((employee) => this.listForEmployee(employee.id));
  }

  async listForEmployee(employeeId: string): Promise<unknown[]> {
    return this.db.withTenant((m) =>
      m.query(
        `SELECT r.id,
                to_char(r.target_date, 'YYYY-MM-DD') AS "targetDate",
                r.correction_type AS "correctionType",
                r.requested_check_in AS "requestedCheckIn",
                r.requested_check_out AS "requestedCheckOut",
                r.reason, r.origin,
                r.applied_at AS "appliedAt", r.created_at AS "createdAt",
                COALESCE(ar.status, 'applied') AS "status"
         FROM regularization_requests r
         LEFT JOIN approval_requests ar ON ar.id = r.approval_request_id
         WHERE r.employee_id = $1
         ORDER BY r.created_at DESC`,
        [employeeId],
      ),
    );
  }

  // Applies an approved request once. A rejection leaves the request as the
  // record of what was asked; its status is read from the approval.
  private async onDecided(view: ApprovalView, m: EntityManager): Promise<void> {
    if (view.request.status !== 'approved') {
      return;
    }
    const req = await m.findOne(RegularizationRequest, {
      where: { approvalRequestId: view.request.id },
    });
    if (req && !req.appliedAt) {
      await this.materialize(m, req, 'regularized', req.createdBySub);
    }
  }

  private async materialize(
    m: EntityManager,
    req: RegularizationRequest,
    origin: 'regularized' | 'admin',
    actorSub: string | undefined,
  ): Promise<void> {
    const marks: Array<{ type: 'check_in' | 'check_out'; ts: Date }> = [];
    if (req.requestedCheckIn) {
      marks.push({ type: 'check_in', ts: new Date(req.requestedCheckIn) });
    }
    if (req.requestedCheckOut) {
      marks.push({ type: 'check_out', ts: new Date(req.requestedCheckOut) });
    }
    for (const mark of marks) {
      await m.save(
        m.create(AttendanceEvent, {
          tenantId: req.tenantId,
          employeeId: req.employeeId,
          eventType: mark.type,
          serverTs: mark.ts,
          origin,
          geofencePass: undefined,
          remote: false,
          riskScore: 0,
          band: 'clean',
          enrichmentStatus: 'done',
        }),
      );
    }

    // Reverse any absence the job recorded for the corrected day (FR-AT-38).
    const reversed = await m.query(
      `UPDATE absence_records
       SET reversed_at = now(), reversed_by = $2,
           reversal_reason = 'regularization ' || $3
       WHERE employee_id = $1 AND absence_date = $4 AND reversed_at IS NULL
       RETURNING id`,
      [req.employeeId, actorSub ?? null, req.id, req.targetDate],
    );

    req.appliedAt = new Date();
    await m.save(req);

    await this.audit.record(
      {
        action: 'attendance.regularization_apply',
        resourceType: 'regularization_request',
        resourceId: req.id,
        after: {
          origin,
          targetDate: req.targetDate,
          correctionType: req.correctionType,
          reversedAbsence: reversed.length > 0,
        },
      },
      m,
    );
  }

  // A regularization must not duplicate an existing live mark of the same type
  // on the target day.
  private async assertNoLiveMark(
    m: EntityManager,
    employeeId: string,
    valid: ValidatedInput,
  ): Promise<void> {
    const types: string[] = [];
    if (valid.checkIn) types.push('check_in');
    if (valid.checkOut) types.push('check_out');
    const rows = await m.query(
      `SELECT count(*)::int AS n FROM attendance_events
       WHERE employee_id = $1
         AND event_type = ANY($2)
         AND (server_ts AT TIME ZONE 'UTC')::date = $3`,
      [employeeId, types, valid.targetDate],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      throw new BadRequestException(
        'A mark of that type already exists for the selected day.',
      );
    }
  }

  private async assertRateLimit(
    m: EntityManager,
    employeeId: string,
  ): Promise<void> {
    const rows = await m.query(
      `SELECT count(*)::int AS n FROM regularization_requests r
       LEFT JOIN approval_requests ar ON ar.id = r.approval_request_id
       WHERE r.employee_id = $1
         AND r.origin = 'self_service'
         AND COALESCE(ar.status, 'pending') <> 'rejected'
         AND r.created_at >= now() - ($2 || ' days')::interval`,
      [employeeId, String(RATE_LIMIT_WINDOW_DAYS)],
    );
    if ((rows[0]?.n ?? 0) >= RATE_LIMIT_MAX) {
      throw new BadRequestException(
        `You have reached the limit of ${RATE_LIMIT_MAX} regularization requests in ${RATE_LIMIT_WINDOW_DAYS} days.`,
      );
    }
  }
}

// Validates the correction shape: required times per type, ordering, and that
// each requested time falls on the target day (UTC).
function validate(input: RegularizationInput): ValidatedInput {
  if (!input.targetDate || Number.isNaN(Date.parse(input.targetDate))) {
    throw new BadRequestException('A valid targetDate is required.');
  }
  const targetDate = input.targetDate.slice(0, 10);
  if (targetDate > todayIso()) {
    throw new BadRequestException('The target date cannot be in the future.');
  }
  if (!input.correctionType || !CORRECTION_TYPES.includes(input.correctionType)) {
    throw new BadRequestException(
      `correctionType must be one of: ${CORRECTION_TYPES.join(', ')}.`,
    );
  }
  const reason = input.reason?.trim();
  if (!reason) {
    throw new BadRequestException('A reason is required.');
  }

  const needsIn = input.correctionType !== 'missing_check_out';
  const needsOut = input.correctionType !== 'missing_check_in';
  const checkIn = needsIn ? parseMark(input.requestedCheckIn, 'check-in', targetDate) : null;
  const checkOut = needsOut ? parseMark(input.requestedCheckOut, 'check-out', targetDate) : null;
  if (checkIn && checkOut && checkOut <= checkIn) {
    throw new BadRequestException('The check-out must be after the check-in.');
  }
  return { targetDate, correctionType: input.correctionType, checkIn, checkOut, reason };
}

function parseMark(value: string | undefined, label: string, targetDate: string): Date {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`A valid ${label} time is required.`);
  }
  const ts = new Date(value);
  if (ts.toISOString().slice(0, 10) !== targetDate) {
    throw new BadRequestException(`The ${label} time must fall on the target date.`);
  }
  return ts;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
