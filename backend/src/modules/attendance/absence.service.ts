import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { TenantDbService } from '../../database/tenant-db.service';
import { AbsenceRecord } from '../../entities/absence-record.entity';
import { AuditService } from '../audit/audit.service';

export interface AbsenceRunResult {
  date: string;
  evaluated: number;
  created: number;
  restDay: boolean;
}

@Injectable()
export class AbsenceService {
  private readonly logger = new Logger(AbsenceService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly ctx: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  // Marks absent every employee with an assigned active shift on the date who
  // has no check-in and is not on approved leave, a holiday, or a rest day
  // (FR-AT-19). Runs in the current tenant context; idempotent per day.
  async runForDate(date: string): Promise<AbsenceRunResult> {
    if (Number.isNaN(Date.parse(date))) {
      throw new BadRequestException('A valid date is required.');
    }
    if (date > todayIso()) {
      throw new BadRequestException('Cannot run the absence job for a future date.');
    }
    return this.db.withTenant(async (m) => {
      const weekend = isWeekend(date);
      // Effective shift per employee for the day: a roster entry overrides the
      // standing assignment (T-1E.3). Weekends are a rest day unless the
      // employee is explicitly rostered that day.
      const employees: Array<{
        employeeId: string;
        shiftId: string;
        legalEntityId: string | null;
        rostered: boolean;
      }> = await m.query(
        `SELECT e.id AS "employeeId",
                COALESCE(re.shift_id, es.shift_id) AS "shiftId",
                e.legal_entity_id AS "legalEntityId",
                (re.shift_id IS NOT NULL) AS "rostered"
         FROM employees e
         LEFT JOIN roster_entries re ON re.employee_id = e.id AND re.work_date = $1
         LEFT JOIN employee_shifts es ON es.employee_id = e.id
         LEFT JOIN shifts sr ON sr.id = re.shift_id
         LEFT JOIN shifts ss ON ss.id = es.shift_id
         WHERE e.status = 'active'
           AND COALESCE(re.shift_id, es.shift_id) IS NOT NULL
           AND CASE WHEN re.shift_id IS NOT NULL THEN sr.active ELSE ss.active END = true`,
        [date],
      );
      if (employees.length === 0) {
        return { date, evaluated: 0, created: 0, restDay: weekend };
      }

      const holidayRows: Array<{ legal_entity_id: string | null }> =
        await m.query(
          `SELECT legal_entity_id FROM holidays WHERE holiday_date = $1`,
          [date],
        );
      const tenantWideHoliday = holidayRows.some(
        (h) => h.legal_entity_id === null,
      );
      const holidayEntities = new Set(
        holidayRows.map((h) => h.legal_entity_id).filter(Boolean),
      );
      const onLeave = await this.idSet(
        m,
        `SELECT DISTINCT lr.employee_id AS id
         FROM leave_requests lr
         JOIN approval_requests ar ON ar.id = lr.approval_request_id
         WHERE ar.status = 'approved'
           AND lr.start_date <= $1 AND lr.end_date >= $1`,
        date,
      );
      const checkedIn = await this.idSet(
        m,
        `SELECT DISTINCT employee_id AS id FROM attendance_events
          WHERE event_type = 'check_in'
            AND (server_ts AT TIME ZONE 'UTC')::date = $1`,
        date,
      );
      const already = await this.idSet(
        m,
        `SELECT employee_id AS id FROM absence_records WHERE absence_date = $1`,
        date,
      );

      let created = 0;
      for (const e of employees) {
        if (weekend && !e.rostered) continue;
        if (tenantWideHoliday || holidayEntities.has(e.legalEntityId)) continue;
        if (onLeave.has(e.employeeId)) continue;
        if (checkedIn.has(e.employeeId)) continue;
        if (already.has(e.employeeId)) continue;
        await m.query(
          `INSERT INTO absence_records (tenant_id, employee_id, shift_id, absence_date)
           VALUES (current_setting('app.current_tenant_id')::uuid, $1, $2, $3)`,
          [e.employeeId, e.shiftId, date],
        );
        created += 1;
      }
      await this.audit.record(
        {
          action: 'attendance.absence_run',
          resourceType: 'absence_run',
          after: { date, evaluated: employees.length, created },
        },
        m,
      );
      return { date, evaluated: employees.length, created, restDay: weekend };
    });
  }

  // Reverses an absence (e.g. an approved correction). The record is retained
  // for the audit trail.
  async reverse(
    id: string,
    actorSub: string | undefined,
    reason: string | undefined,
  ): Promise<AbsenceRecord> {
    return this.db.withTenant(async (m) => {
      const record = await m.findOne(AbsenceRecord, { where: { id } });
      if (!record) {
        throw new NotFoundException('Absence record not found.');
      }
      if (record.reversedAt) {
        throw new BadRequestException('This absence is already reversed.');
      }
      record.reversedAt = new Date();
      record.reversedBy = actorSub;
      record.reversalReason = reason?.trim() || undefined;
      await m.save(record);
      await this.audit.record(
        {
          action: 'attendance.absence_reverse',
          resourceType: 'absence_record',
          resourceId: id,
          after: { reason: record.reversalReason },
        },
        m,
      );
      return record;
    });
  }

  listForEmployee(employeeId: string): Promise<unknown[]> {
    return this.db.withTenant((m) =>
      m.query(
        `SELECT id, to_char(absence_date, 'YYYY-MM-DD') AS "absenceDate",
                reversed_at AS "reversedAt", reversal_reason AS "reversalReason",
                created_at AS "createdAt"
         FROM absence_records
         WHERE employee_id = $1
         ORDER BY absence_date DESC`,
        [employeeId],
      ),
    );
  }

  // Runs the sweep for every tenant, each in its own context. Used by the
  // scheduled job, which has no request-bound tenant.
  async runAllTenants(date: string): Promise<void> {
    const tenants: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM tenants`,
    );
    for (const t of tenants) {
      try {
        const result = await this.ctx.runWith(t.id, () =>
          this.runForDate(date),
        );
        this.logger.log(
          `absence run tenant=${t.id} date=${date} created=${result.created}`,
        );
      } catch (e) {
        this.logger.error(`absence run failed for tenant ${t.id}: ${e}`);
      }
    }
  }

  private async idSet(
    m: { query: (sql: string, params: unknown[]) => Promise<Array<{ id: string }>> },
    sql: string,
    date: string,
  ): Promise<Set<string>> {
    const rows = await m.query(sql, [date]);
    return new Set(rows.map((r) => r.id));
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return d === 0 || d === 6;
}
