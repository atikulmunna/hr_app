import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';

// Standard HR dashboards (T-2.7, FR-M10-01). Read-only aggregates over the
// existing operational tables; every query runs inside withTenant, so RLS scopes
// it to the caller's tenant (FR-M10-05). Amounts are never converted across
// currencies: cost is reported per legal entity in its own currency, since the
// system holds no FX rates.
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: TenantDbService) {}

  // A run of the last n calendar months as (m_start, m_end) rows, newest last.
  // n is a clamped integer, so interpolating it is safe.
  private monthsCte(n: number): string {
    return `months AS (
      SELECT gs::date AS m_start,
             (gs + interval '1 month - 1 day')::date AS m_end
        FROM generate_series(
          date_trunc('month', now()) - interval '${n - 1} month',
          date_trunc('month', now()),
          interval '1 month') gs)`;
  }

  private windowStart(n: number): string {
    return `(date_trunc('month', now()) - interval '${n - 1} month')::date`;
  }

  private clamp(months?: number): number {
    const n = Math.trunc(Number(months));
    if (Number.isNaN(n)) {
      return 12;
    }
    return Math.min(36, Math.max(1, n));
  }

  // FR-M10-01: current headcount overall, by entity, by department, and its
  // month-end trend.
  headcount() {
    return this.db.withTenant(async (m: EntityManager) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total FROM employees
          WHERE erased_at IS NULL AND status <> 'terminated'`,
      );
      const byEntity = await m.query(
        `SELECT le.id AS "legalEntityId", le.name,
                count(e.id)::int AS headcount
           FROM legal_entities le
           LEFT JOIN employees e ON e.legal_entity_id = le.id
                AND e.erased_at IS NULL AND e.status <> 'terminated'
          GROUP BY le.id, le.name
          ORDER BY headcount DESC`,
      );
      const byDepartment = await m.query(
        `SELECT COALESCE(d.name, 'Unassigned') AS name,
                count(e.id)::int AS headcount
           FROM employees e
           LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.erased_at IS NULL AND e.status <> 'terminated'
          GROUP BY COALESCE(d.name, 'Unassigned')
          ORDER BY headcount DESC`,
      );
      const trend = await m.query(
        `WITH ${this.monthsCte(12)}
         SELECT to_char(mo.m_start, 'YYYY-MM') AS month,
                (SELECT count(*) FROM employees e
                  WHERE e.erased_at IS NULL
                    -- An employee with no recorded hire date is counted as
                    -- already on the books, so the latest month matches the
                    -- current headcount rather than silently undercounting.
                    AND (e.hire_date IS NULL OR e.hire_date <= mo.m_end)
                    AND NOT EXISTS (
                      SELECT 1 FROM employment_history h
                       WHERE h.employee_id = e.id
                         AND h.status = 'terminated'
                         AND h.effective_date <= mo.m_end))::int AS headcount
           FROM months mo
          ORDER BY mo.m_start`,
      );
      return { total, byEntity, byDepartment, trend };
    });
  }

  // FR-M10-01: leavers over the window as a rate, with a joiners-vs-leavers
  // series. A leaver is a 'terminated' employment_history row on its date.
  attrition(months?: number) {
    const n = this.clamp(months);
    return this.db.withTenant(async (m: EntityManager) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total FROM employees
          WHERE erased_at IS NULL AND status <> 'terminated'`,
      );
      const series = await m.query(
        `WITH ${this.monthsCte(n)}
         SELECT to_char(mo.m_start, 'YYYY-MM') AS month,
                (SELECT count(*) FROM employees e
                  WHERE e.erased_at IS NULL
                    AND e.hire_date BETWEEN mo.m_start AND mo.m_end)::int AS joiners,
                (SELECT count(*) FROM employment_history h
                  WHERE h.status = 'terminated'
                    AND h.effective_date BETWEEN mo.m_start AND mo.m_end)::int AS leavers
           FROM months mo
          ORDER BY mo.m_start`,
      );
      const leavers = series.reduce(
        (s: number, r: { leavers: number }) => s + r.leavers,
        0,
      );
      const joiners = series.reduce(
        (s: number, r: { joiners: number }) => s + r.joiners,
        0,
      );
      // Leavers over the window against the present active headcount. A small
      // base can read high, so the raw counts are returned alongside.
      const rate = total > 0 ? Math.round((leavers / total) * 1000) / 10 : 0;
      return { months: n, rate, leavers, joiners, headcount: total, series };
    });
  }

  // FR-M10-01/02: unexcused absence days and approved leave days per month.
  absence(months?: number) {
    const n = this.clamp(months);
    return this.db.withTenant(async (m: EntityManager) => {
      const series = await m.query(
        `WITH ${this.monthsCte(n)}
         SELECT to_char(mo.m_start, 'YYYY-MM') AS month,
                (SELECT count(*) FROM absence_records a
                  WHERE a.reversed_at IS NULL
                    AND a.absence_date BETWEEN mo.m_start AND mo.m_end)::int AS "absenceDays",
                (SELECT COALESCE(sum(l.working_days), 0) FROM leave_requests l
                   JOIN approval_requests ar ON ar.id = l.approval_request_id
                  WHERE ar.status = 'approved'
                    AND l.start_date BETWEEN mo.m_start AND mo.m_end)::float AS "leaveDays"
           FROM months mo
          ORDER BY mo.m_start`,
      );
      const totalAbsence = series.reduce(
        (s: number, r: { absenceDays: number }) => s + r.absenceDays,
        0,
      );
      const totalLeave = series.reduce(
        (s: number, r: { leaveDays: number }) => s + r.leaveDays,
        0,
      );
      return { months: n, totalAbsence, totalLeave, series };
    });
  }

  // FR-M10-01: overtime paid into runs. Hours are summed across entities (a
  // count, currency-agnostic); cost stays per entity in its currency.
  overtime(months?: number) {
    const n = this.clamp(months);
    return this.db.withTenant(async (m: EntityManager) => {
      const byEntity = await m.query(
        `SELECT le.id AS "legalEntityId", le.name, le.currency_code AS "currencyCode",
                COALESCE(sum(pe.overtime_hours), 0)::float AS hours,
                COALESCE(sum(pe.overtime_amount), 0)::float AS amount
           FROM payroll_run_employees pe
           JOIN payroll_runs r ON r.id = pe.run_id
           JOIN legal_entities le ON le.id = r.legal_entity_id
          WHERE r.period_start >= ${this.windowStart(n)}
          GROUP BY le.id, le.name, le.currency_code
          ORDER BY hours DESC`,
      );
      const series = await m.query(
        `WITH ${this.monthsCte(n)}
         SELECT to_char(mo.m_start, 'YYYY-MM') AS month,
                COALESCE((SELECT sum(pe.overtime_hours) FROM payroll_run_employees pe
                            JOIN payroll_runs r ON r.id = pe.run_id
                           WHERE r.period_start BETWEEN mo.m_start AND mo.m_end), 0)::float AS hours
           FROM months mo
          ORDER BY mo.m_start`,
      );
      const totalHours = byEntity.reduce(
        (s: number, r: { hours: number }) => s + r.hours,
        0,
      );
      return { months: n, totalHours, byEntity, series };
    });
  }

  // FR-M10-01: cost-to-company per entity (gross + employer contributions +
  // settled adjustments), each in its own currency, with a monthly series.
  costToCompany(months?: number) {
    const n = this.clamp(months);
    return this.db.withTenant(async (m: EntityManager) => {
      const totals = await m.query(
        `SELECT le.id AS "legalEntityId", le.name, le.currency_code AS "currencyCode",
                COALESCE(sum(pe.gross), 0)::float AS gross,
                COALESCE(sum(pe.employer_contributions), 0)::float AS employer,
                COALESCE(sum(pe.adjustments), 0)::float AS adjustments,
                COALESCE(sum(pe.net), 0)::float AS net,
                COALESCE(sum(pe.gross + pe.employer_contributions + pe.adjustments), 0)::float AS ctc
           FROM payroll_run_employees pe
           JOIN payroll_runs r ON r.id = pe.run_id
           JOIN legal_entities le ON le.id = r.legal_entity_id
          WHERE r.period_start >= ${this.windowStart(n)}
          GROUP BY le.id, le.name, le.currency_code
          ORDER BY ctc DESC`,
      );
      const monthly = await m.query(
        `SELECT r.legal_entity_id AS "legalEntityId",
                to_char(date_trunc('month', r.period_start), 'YYYY-MM') AS month,
                COALESCE(sum(pe.gross + pe.employer_contributions + pe.adjustments), 0)::float AS ctc
           FROM payroll_run_employees pe
           JOIN payroll_runs r ON r.id = pe.run_id
          WHERE r.period_start >= ${this.windowStart(n)}
          GROUP BY r.legal_entity_id, date_trunc('month', r.period_start)
          ORDER BY month`,
      );
      const entities = totals.map(
        (t: { legalEntityId: string; ctc: number }) => ({
          ...t,
          series: monthly
            .filter(
              (x: { legalEntityId: string }) =>
                x.legalEntityId === t.legalEntityId,
            )
            .map((x: { month: string; ctc: number }) => ({
              month: x.month,
              ctc: x.ctc,
            })),
        }),
      );
      return { months: n, entities };
    });
  }
}
