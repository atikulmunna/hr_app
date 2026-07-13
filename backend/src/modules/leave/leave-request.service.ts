import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { LeaveRequest } from '../../entities/leave-request.entity';
import { LeaveType } from '../../entities/leave-type.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { WorkflowService } from '../workflow/workflow.service';

const LEAVE_APPROVER_ROLES = ['manager'];
const MAX_RANGE_DAYS = 366;
const ACTIVE_STATUSES = ['pending', 'approved'];

export interface ApplyLeaveInput {
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  annualQuota: number;
  used: number;
  remaining: number;
}

@Injectable()
export class LeaveRequestService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly workflow: WorkflowService,
  ) {}

  async apply(user: AuthUser, input: ApplyLeaveInput) {
    if (!input.leaveTypeId || !input.startDate || !input.endDate) {
      throw new BadRequestException(
        'leaveTypeId, startDate, and endDate are required.',
      );
    }
    if (
      Number.isNaN(Date.parse(input.startDate)) ||
      Number.isNaN(Date.parse(input.endDate))
    ) {
      throw new BadRequestException('startDate and endDate must be dates.');
    }
    if (input.endDate < input.startDate) {
      throw new BadRequestException('endDate cannot be before startDate.');
    }

    const employee = await this.employees.myProfile(user.sub, user.email);

    // Read-only validation: type, working days, notice, overlap, balance.
    const { type, workingDays, teamConflicts } = await this.db.withTenant(
      async (m) => {
        const leaveType = await this.applicableType(
          m,
          input.leaveTypeId!,
          employee.legalEntityId,
        );
        const holidays = await this.holidaySet(m, employee.legalEntityId);
        const days = countWorkingDays(
          input.startDate!,
          input.endDate!,
          holidays,
        );
        if (days <= 0) {
          throw new BadRequestException(
            'The selected dates are all weekends or holidays.',
          );
        }
        this.assertNotice(input.startDate!, leaveType.noticeDays);
        await this.assertNoOverlap(
          m,
          employee.id,
          input.startDate!,
          input.endDate!,
        );
        await this.assertBalance(m, employee.id, leaveType, days);
        const conflicts = await this.teamConflicts(
          m,
          employee.id,
          employee.departmentId,
          input.startDate!,
          input.endDate!,
        );
        return { type: leaveType, workingDays: days, teamConflicts: conflicts };
      },
    );

    // Route through the shared workflow engine (opens its own transaction).
    const approval = await this.workflow.createRequest({
      requestType: 'leave_request',
      resourceType: 'leave',
      payload: {
        employeeId: employee.id,
        leaveTypeId: type.id,
        typeName: type.name,
        startDate: input.startDate,
        endDate: input.endDate,
        workingDays,
      },
      approverRoles: LEAVE_APPROVER_ROLES,
    });

    const request = await this.db.withTenant(async (m) => {
      const saved = await m.save(
        m.create(LeaveRequest, {
          tenantId: this.db.tenantId,
          employeeId: employee.id,
          leaveTypeId: type.id,
          startDate: input.startDate,
          endDate: input.endDate,
          workingDays,
          reason: input.reason?.trim() || undefined,
          approvalRequestId: approval.request.id,
        }),
      );
      await this.audit.record(
        {
          action: 'leave.request',
          resourceType: 'leave_request',
          resourceId: saved.id,
          after: {
            leaveTypeId: type.id,
            startDate: input.startDate,
            endDate: input.endDate,
            workingDays,
          },
        },
        m,
      );
      return saved;
    });

    return { request, workingDays, teamConflicts };
  }

  myRequests(user: AuthUser): Promise<unknown[]> {
    return this.employees
      .myProfile(user.sub, user.email)
      .then((employee) => this.requestsFor(employee.id));
  }

  requestsFor(employeeId: string): Promise<unknown[]> {
    return this.db.withTenant((m) =>
      m.query(
        `SELECT lr.id,
                to_char(lr.start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(lr.end_date, 'YYYY-MM-DD') AS "endDate",
                lr.working_days::float AS "workingDays", lr.reason,
                lr.created_at AS "createdAt",
                lt.name AS "typeName", lt.code AS "typeCode",
                ar.status AS "status"
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         LEFT JOIN approval_requests ar ON ar.id = lr.approval_request_id
         WHERE lr.employee_id = $1
         ORDER BY lr.created_at DESC`,
        [employeeId],
      ),
    );
  }

  async myBalances(user: AuthUser): Promise<LeaveBalance[]> {
    const employee = await this.employees.myProfile(user.sub, user.email);
    const rows: Array<Omit<LeaveBalance, 'remaining'>> = await this.db.withTenant(
      (m) =>
        m.query(
          `SELECT lt.id AS "leaveTypeId", lt.code, lt.name,
                  lt.annual_quota::float AS "annualQuota",
                  COALESCE(SUM(lr.working_days) FILTER (
                    WHERE ar.status = ANY($3)
                      AND date_part('year', lr.start_date) = date_part('year', CURRENT_DATE)
                  ), 0)::float AS "used"
           FROM leave_types lt
           LEFT JOIN leave_requests lr
             ON lr.leave_type_id = lt.id AND lr.employee_id = $1
           LEFT JOIN approval_requests ar ON ar.id = lr.approval_request_id
           WHERE lt.active = true
             AND (lt.legal_entity_id IS NULL OR lt.legal_entity_id = $2)
           GROUP BY lt.id, lt.code, lt.name, lt.annual_quota
           ORDER BY lt.name`,
          [employee.id, employee.legalEntityId, ACTIVE_STATUSES],
        ),
    );
    return rows.map((r) => ({
      ...r,
      remaining: Math.max(r.annualQuota - r.used, 0),
    }));
  }

  private async applicableType(
    m: EntityManager,
    leaveTypeId: string,
    legalEntityId: string,
  ): Promise<LeaveType> {
    const type = await m.findOne(LeaveType, { where: { id: leaveTypeId } });
    if (!type || !type.active) {
      throw new BadRequestException('That leave type is not available.');
    }
    if (type.legalEntityId && type.legalEntityId !== legalEntityId) {
      throw new BadRequestException(
        'That leave type does not apply to your entity.',
      );
    }
    return type;
  }

  private async holidaySet(
    m: EntityManager,
    legalEntityId: string,
  ): Promise<Set<string>> {
    const rows: Array<{ d: string }> = await m.query(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d FROM holidays
        WHERE legal_entity_id IS NULL OR legal_entity_id = $1`,
      [legalEntityId],
    );
    return new Set(rows.map((r) => r.d));
  }

  private assertNotice(startDate: string, noticeDays: number): void {
    if (noticeDays <= 0) {
      return;
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(startDate + 'T00:00:00Z');
    const daysAhead = Math.round(
      (start.getTime() - today.getTime()) / 86_400_000,
    );
    if (daysAhead < noticeDays) {
      throw new BadRequestException(
        `This leave type needs ${noticeDays} days notice.`,
      );
    }
  }

  private async assertNoOverlap(
    m: EntityManager,
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const rows = await m.query(
      `SELECT count(*)::int AS n
       FROM leave_requests lr
       JOIN approval_requests ar ON ar.id = lr.approval_request_id
       WHERE lr.employee_id = $1
         AND ar.status = ANY($4)
         AND lr.start_date <= $3 AND lr.end_date >= $2`,
      [employeeId, startDate, endDate, ACTIVE_STATUSES],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      throw new BadRequestException(
        'This overlaps leave you have already requested.',
      );
    }
  }

  private async assertBalance(
    m: EntityManager,
    employeeId: string,
    type: LeaveType,
    days: number,
  ): Promise<void> {
    const rows = await m.query(
      `SELECT COALESCE(SUM(lr.working_days), 0)::float AS used
       FROM leave_requests lr
       JOIN approval_requests ar ON ar.id = lr.approval_request_id
       WHERE lr.employee_id = $1 AND lr.leave_type_id = $2
         AND ar.status = ANY($3)
         AND date_part('year', lr.start_date) = date_part('year', CURRENT_DATE)`,
      [employeeId, type.id, ACTIVE_STATUSES],
    );
    const used: number = rows[0]?.used ?? 0;
    const remaining = Number(type.annualQuota) - used;
    if (days > remaining) {
      throw new BadRequestException(
        `Not enough balance: ${remaining} day(s) left, ${days} requested.`,
      );
    }
  }

  private async teamConflicts(
    m: EntityManager,
    employeeId: string,
    departmentId: string | undefined,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ name: string; startDate: string; endDate: string }>> {
    if (!departmentId) {
      return [];
    }
    const rows: Array<{
      name: string;
      startDate: string;
      endDate: string;
    }> = await m.query(
      `SELECT emp.first_name || ' ' || emp.last_name AS "name",
              to_char(lr.start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(lr.end_date, 'YYYY-MM-DD') AS "endDate"
       FROM leave_requests lr
       JOIN approval_requests ar ON ar.id = lr.approval_request_id
       JOIN employees emp ON emp.id = lr.employee_id
       WHERE emp.department_id = $1
         AND lr.employee_id <> $2
         AND ar.status = ANY($5)
         AND lr.start_date <= $4 AND lr.end_date >= $3`,
      [departmentId, employeeId, startDate, endDate, ACTIVE_STATUSES],
    );
    return rows;
  }
}

// Days in [start, end] that are not weekends or holidays. Weekends are Saturday
// and Sunday for now; per-entity rest days land with shifts (T-1C.9).
export function countWorkingDays(
  start: string,
  end: string,
  holidays: Set<string>,
): number {
  let count = 0;
  let guard = 0;
  const cursor = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (cursor <= last) {
    if (guard++ > MAX_RANGE_DAYS) {
      throw new BadRequestException('The leave range is too long.');
    }
    const iso = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(iso)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
