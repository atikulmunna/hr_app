import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  OvertimeRequest,
  OvertimeSource,
} from '../../entities/overtime-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { SummaryService } from '../shifts/summary.service';
import { WorkflowService } from '../workflow/workflow.service';

const OVERTIME_APPROVER_ROLES = ['manager'];

export interface OvertimeInput {
  workDate?: string;
  hours?: number;
  source?: OvertimeSource;
  reason?: string;
}

export interface OvertimeRow {
  id: string;
  workDate: string;
  hours: number;
  source: OvertimeSource;
  reason: string;
  status: string;
  derivedHours: number | null;
  createdAt: string;
}

// Approval-gated payable overtime (FR-M2-06, O-07). Derived overtime is only a
// claim until a manager approves it; payroll sums approved hours only.
@Injectable()
export class OvertimeService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly summaries: SummaryService,
    private readonly workflow: WorkflowService,
  ) {}

  async requestForSelf(user: AuthUser, input: OvertimeInput) {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.submit(employee.id, input, user.sub);
  }

  async requestFor(employeeId: string, input: OvertimeInput, user: AuthUser) {
    return this.submit(employeeId, input, user.sub);
  }

  async mine(user: AuthUser): Promise<OvertimeRow[]> {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.listForEmployee(employee.id);
  }

  async listForEmployee(employeeId: string): Promise<OvertimeRow[]> {
    return this.db.withTenant(async (m) => {
      const rows = (await m.query(
        `SELECT o.id,
                to_char(o.work_date, 'YYYY-MM-DD') AS "workDate",
                o.hours::float AS hours,
                o.source,
                o.reason,
                COALESCE(ar.status, 'pending') AS status,
                o.created_at AS "createdAt"
           FROM overtime_requests o
           LEFT JOIN approval_requests ar ON ar.id = o.approval_request_id
          WHERE o.employee_id = $1
          ORDER BY o.work_date DESC, o.created_at DESC`,
        [employeeId],
      )) as OvertimeRow[];
      return rows;
    });
  }

  // Approved overtime hours falling inside a period. This is what payroll pays;
  // pending and rejected claims are worth nothing (FR-M2-06).
  async approvedHours(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<number> {
    return this.db.withTenant(async (m) => {
      const rows = (await m.query(
        `SELECT COALESCE(SUM(o.hours), 0)::float AS hours
           FROM overtime_requests o
           JOIN approval_requests ar ON ar.id = o.approval_request_id
          WHERE o.employee_id = $1
            AND o.work_date BETWEEN $2 AND $3
            AND ar.status = 'approved'`,
        [employeeId, from, to],
      )) as { hours: number }[];
      return rows[0]?.hours ?? 0;
    });
  }

  private async submit(
    employeeId: string,
    input: OvertimeInput,
    sub: string | undefined,
  ) {
    const workDate = requireDate(input.workDate);
    const hours = input.hours;
    const source: OvertimeSource = input.source ?? 'derived';
    const reason = input.reason?.trim();

    if (typeof hours !== 'number' || Number.isNaN(hours) || hours <= 0) {
      throw new BadRequestException('hours must be greater than 0.');
    }
    if (hours > 24) {
      throw new BadRequestException('hours cannot exceed 24 for one day.');
    }
    if (!reason) {
      throw new BadRequestException('A reason is required for overtime.');
    }
    if (source !== 'derived' && source !== 'declared') {
      throw new BadRequestException('source must be derived or declared.');
    }
    if (workDate > today()) {
      throw new BadRequestException(
        'Overtime cannot be claimed for a future date.',
      );
    }

    // A derived claim must match what the marks actually support; anything more
    // is an exception and must be declared as one (FR-M2-06).
    if (source === 'derived') {
      const derived = await this.derivedHours(employeeId, workDate);
      if (derived <= 0) {
        throw new BadRequestException(
          `No overtime was derived from the marks on ${workDate}. Declare it manually if it is an exception.`,
        );
      }
      if (hours > derived + 0.01) {
        throw new BadRequestException(
          `Only ${derived} h of overtime was derived on ${workDate}. Claim that or less, or declare the extra manually.`,
        );
      }
    }

    return this.db.withTenant(async (m) => {
      await this.assertNoExisting(m, employeeId, workDate);
      const approval = await this.workflow.createRequest(
        {
          requestType: 'overtime',
          resourceType: 'attendance',
          payload: { employeeId, workDate, hours, source },
          approverRoles: OVERTIME_APPROVER_ROLES,
        },
        m,
      );
      const saved = await m.save(
        m.create(OvertimeRequest, {
          tenantId: this.db.tenantId,
          employeeId,
          workDate,
          hours: hours.toFixed(2),
          source,
          reason,
          createdBySub: sub,
          approvalRequestId: approval.request.id,
        }),
      );
      await this.audit.record(
        {
          action: 'attendance.overtime_request',
          resourceType: 'overtime_request',
          resourceId: saved.id,
          after: { workDate, hours, source },
        },
        m,
      );
      return saved;
    });
  }

  // The overtime the summary derived for one day, from the marks and the shift.
  private async derivedHours(
    employeeId: string,
    workDate: string,
  ): Promise<number> {
    const summary = await this.summaries.summary(
      employeeId,
      workDate,
      workDate,
    );
    return summary.days[0]?.overtimeHours ?? 0;
  }

  // One claim per date, unless the previous one was rejected.
  private async assertNoExisting(
    m: EntityManager,
    employeeId: string,
    workDate: string,
  ): Promise<void> {
    const rows = (await m.query(
      `SELECT COALESCE(ar.status, 'pending') AS status
         FROM overtime_requests o
         LEFT JOIN approval_requests ar ON ar.id = o.approval_request_id
        WHERE o.employee_id = $1 AND o.work_date = $2`,
      [employeeId, workDate],
    )) as { status: string }[];
    const live = rows.find((r) => r.status !== 'rejected');
    if (live) {
      throw new BadRequestException(
        `Overtime for ${workDate} is already ${live.status}.`,
      );
    }
  }
}

function requireDate(value: string | undefined): string {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new BadRequestException('workDate must be a YYYY-MM-DD date.');
  }
  return value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
