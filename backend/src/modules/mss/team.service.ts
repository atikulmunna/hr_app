import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { AttendanceSummary, SummaryService } from '../shifts/summary.service';

export type TodayStatus =
  | 'leave'
  | 'checked_out'
  | 'checked_in'
  | 'absent'
  | 'not_in';

export interface TeamMember {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  shiftName: string | null;
  todayStatus: TodayStatus;
}

export interface TeamAttendanceRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  shiftName: string | null;
  totals: AttendanceSummary['totals'];
}

const MAX_RANGE_DAYS = 92;

// Manager self-service (T-1E.2, FR-M9-06): a manager's view of their direct
// reports, team attendance, and team leave. Every method is scoped to the
// caller's own reports (employees whose manager is the caller), so no
// cross-team access is possible.
@Injectable()
export class TeamService {
  constructor(
    private readonly db: TenantDbService,
    private readonly employees: EmployeeService,
    private readonly summaries: SummaryService,
  ) {}

  async directReports(user: AuthUser): Promise<TeamMember[]> {
    const manager = await this.employees.myProfile(user.sub, user.email);
    const today = todayIso();
    return this.db.withTenant(async (m) => {
      const rows: Array<Omit<TeamMember, 'todayStatus'>> = await m.query(
        `SELECT e.id, e.employee_code AS "employeeCode",
                e.first_name AS "firstName", e.last_name AS "lastName",
                e.job_title AS "jobTitle", s.name AS "shiftName"
         FROM employees e
         LEFT JOIN employee_shifts es ON es.employee_id = e.id
         LEFT JOIN shifts s ON s.id = es.shift_id
         WHERE e.manager_id = $1 AND e.status = 'active'
         ORDER BY e.first_name, e.last_name`,
        [manager.id],
      );
      if (rows.length === 0) {
        return [];
      }
      const ids = rows.map((r) => r.id);
      const onLeave = await this.idSet(
        m,
        `SELECT DISTINCT lr.employee_id AS id
         FROM leave_requests lr
         JOIN approval_requests ar ON ar.id = lr.approval_request_id
         WHERE lr.employee_id = ANY($1) AND ar.status = 'approved'
           AND lr.start_date <= $2 AND lr.end_date >= $2`,
        ids,
        today,
      );
      const checkedIn = await this.idSet(
        m,
        `SELECT DISTINCT employee_id AS id FROM attendance_events
         WHERE employee_id = ANY($1) AND event_type = 'check_in'
           AND (server_ts AT TIME ZONE 'UTC')::date = $2`,
        ids,
        today,
      );
      const checkedOut = await this.idSet(
        m,
        `SELECT DISTINCT employee_id AS id FROM attendance_events
         WHERE employee_id = ANY($1) AND event_type = 'check_out'
           AND (server_ts AT TIME ZONE 'UTC')::date = $2`,
        ids,
        today,
      );
      const absent = await this.idSet(
        m,
        `SELECT employee_id AS id FROM absence_records
         WHERE employee_id = ANY($1) AND absence_date = $2
           AND reversed_at IS NULL`,
        ids,
        today,
      );
      return rows.map((r) => ({
        ...r,
        todayStatus: status(r.id, { onLeave, checkedIn, checkedOut, absent }),
      }));
    });
  }

  // Per-report attendance totals over the window, reusing the summary read
  // model so classification stays consistent with the employee view.
  async teamAttendance(
    user: AuthUser,
    from: string,
    to: string,
  ): Promise<TeamAttendanceRow[]> {
    assertRange(from, to);
    const reports = await this.reportRows(user);
    const out: TeamAttendanceRow[] = [];
    for (const r of reports) {
      const summary = await this.summaries.summary(r.id, from, to);
      out.push({
        employeeId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        shiftName: summary.shift?.name ?? null,
        totals: summary.totals,
      });
    }
    return out;
  }

  async teamLeave(user: AuthUser, from: string, to: string) {
    assertRange(from, to);
    const manager = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant((m) =>
      m.query(
        `SELECT lr.id, lr.employee_id AS "employeeId",
                emp.first_name || ' ' || emp.last_name AS "name",
                to_char(lr.start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(lr.end_date, 'YYYY-MM-DD') AS "endDate",
                lr.working_days::float AS "workingDays",
                lt.code AS "typeCode", lt.name AS "typeName",
                COALESCE(ar.status, 'pending') AS "status"
         FROM leave_requests lr
         JOIN employees emp ON emp.id = lr.employee_id
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         LEFT JOIN approval_requests ar ON ar.id = lr.approval_request_id
         WHERE emp.manager_id = $1
           AND COALESCE(ar.status, 'pending') IN ('pending', 'approved')
           AND lr.start_date <= $3 AND lr.end_date >= $2
         ORDER BY lr.start_date`,
        [manager.id, from, to],
      ),
    );
  }

  private async reportRows(
    user: AuthUser,
  ): Promise<Array<{ id: string; firstName: string; lastName: string }>> {
    const manager = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant((m) =>
      m.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName"
         FROM employees
         WHERE manager_id = $1 AND status = 'active'
         ORDER BY first_name, last_name`,
        [manager.id],
      ),
    );
  }

  private async idSet(
    m: EntityManager,
    sql: string,
    ids: string[],
    date: string,
  ): Promise<Set<string>> {
    const rows: Array<{ id: string }> = await m.query(sql, [ids, date]);
    return new Set(rows.map((r) => r.id));
  }
}

function status(
  id: string,
  sets: {
    onLeave: Set<string>;
    checkedIn: Set<string>;
    checkedOut: Set<string>;
    absent: Set<string>;
  },
): TodayStatus {
  if (sets.onLeave.has(id)) return 'leave';
  if (sets.checkedOut.has(id)) return 'checked_out';
  if (sets.checkedIn.has(id)) return 'checked_in';
  if (sets.absent.has(id)) return 'absent';
  return 'not_in';
}

function assertRange(from: string, to: string): void {
  if (
    Number.isNaN(Date.parse(from)) ||
    Number.isNaN(Date.parse(to)) ||
    to < from
  ) {
    throw new BadRequestException('Provide a valid from and to date range.');
  }
  const days =
    (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException('The date range is too long.');
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
