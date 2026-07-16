import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { RosterEntry } from '../../entities/roster-entry.entity';
import { Shift } from '../../entities/shift.entity';
import { AuditService } from '../audit/audit.service';
import { SwapService } from './swap.service';

export interface AssignRosterInput {
  workDate?: string;
  shiftId?: string;
  note?: string;
}

export interface AssignRosterRangeInput {
  from?: string;
  to?: string;
  shiftId?: string;
  note?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 92;

// Per-date roster (T-1E.3, FR-M2-02). A roster entry overrides the standing
// shift for one day. HR and managers assign entries; the summary and absence
// job prefer a day's roster entry over the standing assignment.
@Injectable()
export class RosterService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly swap: SwapService,
  ) {}

  listForEmployee(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<unknown[]> {
    assertRange(from, to);
    return this.db.withTenant(async (m) => {
      // Reflect any approved swap in the schedule before reading.
      await this.swap.syncApproved(m, employeeId);
      return m.query(
        `SELECT re.id,
                to_char(re.work_date, 'YYYY-MM-DD') AS "workDate",
                re.shift_id AS "shiftId", re.source, re.note,
                s.name AS "shiftName", s.start_time AS "startTime",
                s.end_time AS "endTime"
         FROM roster_entries re
         JOIN shifts s ON s.id = re.shift_id
         WHERE re.employee_id = $1 AND re.work_date BETWEEN $2 AND $3
         ORDER BY re.work_date`,
        [employeeId, from, to],
      );
    });
  }

  // Upcoming roster entries of the employee's department peers, so an employee
  // can pick a counterparty day for a shift swap (T-1E.3).
  listSwappable(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<unknown[]> {
    assertRange(from, to);
    const today = new Date().toISOString().slice(0, 10);
    const start = from > today ? from : today;
    return this.db.withTenant((m) =>
      m.query(
        `SELECT re.id,
                re.employee_id AS "employeeId",
                peer.first_name || ' ' || peer.last_name AS "employeeName",
                to_char(re.work_date, 'YYYY-MM-DD') AS "workDate",
                s.name AS "shiftName", s.start_time AS "startTime",
                s.end_time AS "endTime"
         FROM roster_entries re
         JOIN employees peer ON peer.id = re.employee_id
         JOIN shifts s ON s.id = re.shift_id
         WHERE peer.department_id = (
                 SELECT department_id FROM employees WHERE id = $1
               )
           AND peer.department_id IS NOT NULL
           AND re.employee_id <> $1
           AND re.work_date > $4
           AND re.work_date BETWEEN $2 AND $3
         ORDER BY re.work_date`,
        [employeeId, start, to, today],
      ),
    );
  }

  async assign(
    employeeId: string,
    input: AssignRosterInput,
    actorSub: string | undefined,
  ): Promise<RosterEntry> {
    const workDate = assertDate(input.workDate, 'workDate');
    if (!input.shiftId) {
      throw new BadRequestException('A shiftId is required.');
    }
    return this.db.withTenant((m) =>
      this.upsert(m, employeeId, workDate, input.shiftId!, input.note, actorSub),
    );
  }

  async assignRange(
    employeeId: string,
    input: AssignRosterRangeInput,
    actorSub: string | undefined,
  ): Promise<{ assigned: number }> {
    const from = assertDate(input.from, 'from');
    const to = assertDate(input.to, 'to');
    if (to < from) {
      throw new BadRequestException('to cannot be before from.');
    }
    if (!input.shiftId) {
      throw new BadRequestException('A shiftId is required.');
    }
    const dates = enumerateDays(from, to);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new BadRequestException('The date range is too long.');
    }
    return this.db.withTenant(async (m) => {
      await this.assertShiftExists(m, input.shiftId!);
      for (const date of dates) {
        await this.upsert(
          m,
          employeeId,
          date,
          input.shiftId!,
          input.note,
          actorSub,
          false,
        );
      }
      await this.audit.record(
        {
          action: 'roster.assign_range',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { from, to, shiftId: input.shiftId },
        },
        m,
      );
      return { assigned: dates.length };
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const entry = await m.findOne(RosterEntry, { where: { id } });
      if (!entry) {
        throw new NotFoundException('Roster entry not found.');
      }
      await m.delete(RosterEntry, { id });
      await this.audit.record(
        {
          action: 'roster.remove',
          resourceType: 'roster_entry',
          resourceId: id,
          before: { employeeId: entry.employeeId, workDate: entry.workDate },
        },
        m,
      );
    });
  }

  // The effective per-day shift override for an employee across a range, used by
  // the summary read model. Keyed by YYYY-MM-DD.
  async shiftMap(
    m: EntityManager,
    employeeId: string,
    from: string,
    to: string,
  ): Promise<Map<string, Shift>> {
    // Reflect any approved swap in the schedule before deriving the summary.
    await this.swap.syncApproved(m, employeeId);
    const rows: Array<{ workDate: string; shift: Shift }> = await m
      .createQueryBuilder(RosterEntry, 're')
      .innerJoinAndMapOne('re.shift', Shift, 's', 's.id = re.shift_id')
      .where('re.employee_id = :employeeId', { employeeId })
      .andWhere('re.work_date BETWEEN :from AND :to', { from, to })
      .andWhere('s.active = true')
      .getMany()
      .then((entries) =>
        entries.map((e) => ({
          workDate: e.workDate,
          shift: (e as RosterEntry & { shift: Shift }).shift,
        })),
      );
    const map = new Map<string, Shift>();
    for (const r of rows) {
      map.set(r.workDate.slice(0, 10), r.shift);
    }
    return map;
  }

  private async upsert(
    m: EntityManager,
    employeeId: string,
    workDate: string,
    shiftId: string,
    note: string | undefined,
    actorSub: string | undefined,
    audit = true,
  ): Promise<RosterEntry> {
    await this.assertShiftExists(m, shiftId);
    const existing = await m.findOne(RosterEntry, {
      where: { employeeId, workDate },
    });
    let saved: RosterEntry;
    if (existing) {
      existing.shiftId = shiftId;
      existing.note = note?.trim() || undefined;
      existing.source = 'manual';
      saved = await m.save(existing);
    } else {
      saved = await m.save(
        m.create(RosterEntry, {
          tenantId: this.db.tenantId,
          employeeId,
          workDate,
          shiftId,
          source: 'manual',
          note: note?.trim() || undefined,
          createdBy: actorSub,
        }),
      );
    }
    if (audit) {
      await this.audit.record(
        {
          action: 'roster.assign',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { workDate, shiftId },
        },
        m,
      );
    }
    return saved;
  }

  private async assertShiftExists(
    m: EntityManager,
    shiftId: string,
  ): Promise<void> {
    const shift = await m.findOne(Shift, { where: { id: shiftId } });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }
  }
}

function assertDate(value: string | undefined, field: string): string {
  if (!value || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
  }
  return value;
}

function assertRange(from: string, to: string): void {
  assertDate(from, 'from');
  assertDate(to, 'to');
  if (to < from) {
    throw new BadRequestException('to cannot be before from.');
  }
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
