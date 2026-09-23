import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Employee } from '../../entities/employee.entity';
import { Shift } from '../../entities/shift.entity';
import { RosterService } from './roster.service';
import { ShiftService } from './shift.service';

export type DayStatus =
  'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'off' | 'scheduled';

export interface DaySummary {
  day: string;
  status: DayStatus;
  checkIn: string | null;
  checkOut: string | null;
  workedHours: number | null;
  overtimeHours: number;
}

export interface AttendanceSummary {
  shift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    expectedHours: number;
  } | null;
  days: DaySummary[];
  totals: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    leaveDays: number;
    workedHours: number;
    overtimeHours: number;
  };
}

interface DayEvents {
  firstIn: string | null;
  lastOut: string | null;
}

const MAX_RANGE_DAYS = 92;
const MS_PER_HOUR = 3_600_000;

// Attendance summary derived from marks against the assigned shift (FR-M2-03,
// FR-M2-06, FR-M2-07). This is a read model; the scheduled job (T-1C.10)
// persists absent status. Days are bucketed on UTC boundaries and shift times
// compared in UTC for now; per-entity timezone handling lands with tenant
// configuration.
@Injectable()
export class SummaryService {
  constructor(
    private readonly db: TenantDbService,
    private readonly shifts: ShiftService,
    private readonly roster: RosterService,
  ) {}

  async summary(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<AttendanceSummary> {
    if (
      Number.isNaN(Date.parse(from)) ||
      Number.isNaN(Date.parse(to)) ||
      to < from
    ) {
      throw new BadRequestException('Provide a valid from and to date range.');
    }
    const days = enumerateDays(from, to);
    if (days.length > MAX_RANGE_DAYS) {
      throw new BadRequestException('The date range is too long.');
    }

    return this.db.withTenant(async (m) => {
      // The standing shift is the default schedule; a per-day roster entry
      // overrides it for that day (T-1E.3). If the employee has neither, there
      // is nothing to classify.
      const standingShift = await this.shifts.assignedShift(m, employeeId);
      const rosterMap = await this.roster.shiftMap(m, employeeId, from, to);
      if (!standingShift && rosterMap.size === 0) {
        return emptySummary();
      }
      const employee = await m.findOne(Employee, {
        where: { id: employeeId },
      });
      const holidays = await this.holidaySet(m, employee?.legalEntityId);
      const leaveRanges = await this.leaveRanges(m, employeeId, from, to);
      const events = await this.dayEvents(m, employeeId, from, to);
      const todayIso = new Date().toISOString().slice(0, 10);

      const rows = days.map((day) =>
        this.classify(day, {
          shift: rosterMap.get(day) ?? standingShift,
          rostered: rosterMap.has(day),
          todayIso,
          holidays,
          leaveRanges,
          dayEvents: events.get(day),
        }),
      );

      return {
        shift: standingShift
          ? {
              id: standingShift.id,
              name: standingShift.name,
              startTime: standingShift.startTime,
              endTime: standingShift.endTime,
              expectedHours: shiftExpectedHours(standingShift),
            }
          : null,
        days: rows,
        totals: totalize(rows),
      };
    });
  }

  private classify(
    day: string,
    ctx: {
      shift: Shift | null;
      rostered: boolean;
      todayIso: string;
      holidays: Set<string>;
      leaveRanges: Array<{ start: string; end: string }>;
      dayEvents?: DayEvents;
    },
  ): DaySummary {
    const base: DaySummary = {
      day,
      status: 'off',
      checkIn: null,
      checkOut: null,
      workedHours: null,
      overtimeHours: 0,
    };

    // No effective shift, or a weekend the employee is not rostered on, is a
    // rest day. A roster entry lets weekend work be scheduled and tracked.
    if (!ctx.shift) {
      return base;
    }
    if (isWeekend(day) && !ctx.rostered) {
      return base;
    }
    if (ctx.holidays.has(day)) {
      return { ...base, status: 'holiday' };
    }
    if (ctx.leaveRanges.some((r) => day >= r.start && day <= r.end)) {
      return { ...base, status: 'leave' };
    }

    const ev = ctx.dayEvents;
    if (!ev?.firstIn) {
      return { ...base, status: day < ctx.todayIso ? 'absent' : 'scheduled' };
    }

    const expectedHours = shiftExpectedHours(ctx.shift);
    const graceLimit =
      timeToMinutes(ctx.shift.startTime) + ctx.shift.graceMinutes;
    const late = utcMinutesOfDay(ev.firstIn) > graceLimit ? 'late' : 'present';
    let workedHours: number | null = null;
    let overtimeHours = 0;
    if (ev.lastOut) {
      const gross =
        (Date.parse(ev.lastOut) - Date.parse(ev.firstIn)) / MS_PER_HOUR;
      workedHours =
        Math.round(Math.max(gross - ctx.shift.breakMinutes / 60, 0) * 100) /
        100;
      overtimeHours =
        Math.round(Math.max(workedHours - expectedHours, 0) * 100) / 100;
    }
    return {
      day,
      status: late,
      checkIn: ev.firstIn,
      checkOut: ev.lastOut,
      workedHours,
      overtimeHours,
    };
  }

  private async holidaySet(
    m: EntityManager,
    legalEntityId: string | undefined,
  ): Promise<Set<string>> {
    const rows: Array<{ d: string }> = await m.query(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d FROM holidays
        WHERE legal_entity_id IS NULL OR legal_entity_id = $1`,
      [legalEntityId ?? null],
    );
    return new Set(rows.map((r) => r.d));
  }

  private leaveRanges(
    m: EntityManager,
    employeeId: string,
    from: string,
    to: string,
  ): Promise<Array<{ start: string; end: string }>> {
    return m.query(
      `SELECT to_char(lr.start_date, 'YYYY-MM-DD') AS start,
              to_char(lr.end_date, 'YYYY-MM-DD') AS end
       FROM leave_requests lr
       JOIN approval_requests ar ON ar.id = lr.approval_request_id
       WHERE lr.employee_id = $1 AND ar.status = 'approved'
         AND lr.start_date <= $3 AND lr.end_date >= $2`,
      [employeeId, from, to],
    );
  }

  private async dayEvents(
    m: EntityManager,
    employeeId: string,
    from: string,
    to: string,
  ): Promise<Map<string, DayEvents>> {
    const rows: Array<{
      day: string;
      firstIn: string | null;
      lastOut: string | null;
    }> = await m.query(
      `SELECT to_char((server_ts AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
                min(server_ts) FILTER (WHERE event_type = 'check_in') AS "firstIn",
                max(server_ts) FILTER (WHERE event_type = 'check_out') AS "lastOut"
         FROM attendance_events
         WHERE employee_id = $1
           AND (server_ts AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3
         GROUP BY 1`,
      [employeeId, from, to],
    );
    const map = new Map<string, DayEvents>();
    for (const r of rows) {
      map.set(r.day, {
        firstIn: r.firstIn ? new Date(r.firstIn).toISOString() : null,
        lastOut: r.lastOut ? new Date(r.lastOut).toISOString() : null,
      });
    }
    return map;
  }
}

function emptySummary(): AttendanceSummary {
  return {
    shift: null,
    days: [],
    totals: {
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      leaveDays: 0,
      workedHours: 0,
      overtimeHours: 0,
    },
  };
}

function totalize(rows: DaySummary[]): AttendanceSummary['totals'] {
  const totals = {
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    leaveDays: 0,
    workedHours: 0,
    overtimeHours: 0,
  };
  for (const r of rows) {
    if (r.status === 'present' || r.status === 'late') {
      totals.presentDays += 1;
    }
    if (r.status === 'late') {
      totals.lateDays += 1;
    }
    if (r.status === 'absent') {
      totals.absentDays += 1;
    }
    if (r.status === 'leave') {
      totals.leaveDays += 1;
    }
    totals.workedHours += r.workedHours ?? 0;
    totals.overtimeHours += r.overtimeHours;
  }
  totals.workedHours = Math.round(totals.workedHours * 100) / 100;
  totals.overtimeHours = Math.round(totals.overtimeHours * 100) / 100;
  return totals;
}

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const last = new Date(to + 'T00:00:00Z');
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function isWeekend(day: string): boolean {
  const d = new Date(day + 'T00:00:00Z').getUTCDay();
  return d === 0 || d === 6;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

function utcMinutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function shiftExpectedHours(shift: Shift): number {
  const gross = timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime);
  return Math.round(((gross - shift.breakMinutes) / 60) * 100) / 100;
}
