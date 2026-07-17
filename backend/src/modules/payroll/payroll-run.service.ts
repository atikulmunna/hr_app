import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { PayrollRun, PayrollRunType } from '../../entities/payroll-run.entity';
import { PayrollRunEmployee } from '../../entities/payroll-run-employee.entity';
import { PayrollRunLine } from '../../entities/payroll-run-line.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { OvertimeService } from '../attendance/overtime.service';
import { SummaryService } from '../shifts/summary.service';
import { CompensationService } from './compensation.service';

export interface CreateRunInput {
  legalEntityId?: string;
  periodStart?: string;
  periodEnd?: string;
  cutoffDate?: string;
  runType?: PayrollRunType;
}

// An employee in scope for a run, with the dates that bound their employment.
interface Candidate {
  id: string;
  hireDate: string | null;
  terminatedOn: string | null;
}

// One employee's inputs, read before the write transaction opens.
interface ComputedRow {
  candidate: Candidate;
  compensation: Awaited<ReturnType<CompensationService['forEmployee']>>;
  summary: Awaited<ReturnType<SummaryService['summary']>>;
  payableDays: number;
  periodDays: number;
  factor: number;
  overtimeHours: number;
  overtimeAmount: number;
}

export interface RunEmployeeView {
  employeeId: string;
  employeeCode: string;
  name: string;
  currencyCode: string;
  payableDays: number;
  periodDays: number;
  prorationFactor: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  workedHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  gross: number;
  deductions: number;
  net: number;
  lines: {
    code: string;
    name: string;
    componentType: string;
    baseAmount: number;
    prorationFactor: number;
    amount: number;
  }[];
}

export interface RunView extends PayrollRun {
  employees: RunEmployeeView[];
  totals: { employees: number; gross: number; deductions: number; net: number };
}

@Injectable()
export class PayrollRunService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly summaries: SummaryService,
    private readonly compensation: CompensationService,
    private readonly overtime: OvertimeService,
  ) {}

  list(legalEntityId?: string): Promise<PayrollRun[]> {
    return this.db.withTenant((m) =>
      m.find(PayrollRun, {
        where: legalEntityId ? { legalEntityId } : {},
        order: { periodStart: 'DESC', createdAt: 'DESC' },
      }),
    );
  }

  async create(input: CreateRunInput, user: AuthUser): Promise<RunView> {
    const periodStart = requireDate(input.periodStart, 'periodStart');
    const periodEnd = requireDate(input.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) {
      throw new BadRequestException('periodEnd cannot be before periodStart.');
    }
    // Compensation is valued here; the period end is the natural default.
    const cutoffDate = input.cutoffDate
      ? requireDate(input.cutoffDate, 'cutoffDate')
      : periodEnd;
    if (cutoffDate < periodStart) {
      throw new BadRequestException(
        'cutoffDate cannot be before the period starts.',
      );
    }
    const runType = input.runType ?? 'monthly';
    if (runType !== 'monthly' && runType !== 'off_cycle') {
      throw new BadRequestException('runType must be monthly or off_cycle.');
    }
    if (!input.legalEntityId) {
      throw new BadRequestException('legalEntityId is required.');
    }

    const runId = await this.db.withTenant(async (m) => {
      const entity = await m.findOne(LegalEntity, {
        where: { id: input.legalEntityId },
      });
      if (!entity) {
        throw new BadRequestException('Unknown legal entity.');
      }
      if (runType === 'monthly') {
        const clash = await m.findOne(PayrollRun, {
          where: {
            legalEntityId: entity.id,
            periodStart,
            periodEnd,
            runType: 'monthly',
          },
        });
        if (clash) {
          throw new BadRequestException(
            `${entity.name} already has a monthly run for ${periodStart} to ${periodEnd}.`,
          );
        }
      }
      // The entity's currency and basis are snapshotted onto the run, so it
      // records the rules it was computed under.
      const run = await m.save(
        m.create(PayrollRun, {
          tenantId: this.db.tenantId,
          legalEntityId: entity.id,
          periodStart,
          periodEnd,
          cutoffDate,
          runType,
          currencyCode: entity.currencyCode,
          prorationBasis: entity.prorationBasis,
          createdBy: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'payroll_run.create',
          resourceType: 'payroll_run',
          resourceId: run.id,
          after: { periodStart, periodEnd, cutoffDate, runType },
        },
        m,
      );
      return run.id;
    });

    return this.compute(runId);
  }

  // Rebuilds the run's employees and lines from current data. Late-arriving
  // marks and corrections belong to this run until it locks (FR-AT-39), so a
  // recompute is the supported way to pick them up.
  async compute(runId: string): Promise<RunView> {
    const { run, candidates, holidays, entity } = await this.db.withTenant(
      async (m) => {
        const found = await m.findOne(PayrollRun, { where: { id: runId } });
        if (!found) {
          throw new NotFoundException('Payroll run not found.');
        }
        const legalEntity = await m.findOne(LegalEntity, {
          where: { id: found.legalEntityId },
        });
        if (!legalEntity) {
          throw new BadRequestException('The run has no legal entity.');
        }
        return {
          run: found,
          candidates: await this.candidates(m, found),
          holidays: await this.holidays(m, found),
          entity: legalEntity,
        };
      },
    );

    const periodDays = countDays(
      run.periodStart,
      run.periodEnd,
      run.prorationBasis,
      holidays,
    );
    // The ordinary hourly rate divides by hours actually expected in the period,
    // so this always counts working days regardless of the proration basis.
    const workingDays = countDays(
      run.periodStart,
      run.periodEnd,
      'working_days',
      holidays,
    );

    // Read outside the write transaction: these services open their own, and
    // nesting would take a second connection per employee.
    const computed: ComputedRow[] = [];
    for (const candidate of candidates) {
      const from = laterOf(run.periodStart, candidate.hireDate);
      const to = earlierOf(run.periodEnd, candidate.terminatedOn);
      const payableDays = countDays(from, to, run.prorationBasis, holidays);
      const factor = prorationFactor(payableDays, periodDays);

      const compensation = await this.compensation.forEmployee(
        candidate.id,
        run.cutoffDate,
      );
      const summary = await this.summaries.summary(
        candidate.id,
        run.periodStart,
        run.periodEnd,
      );
      // Only approved hours are payable (FR-M2-06); the summary's derived
      // figure is a claim, not an entitlement.
      const overtimeHours = await this.overtime.approvedHours(
        candidate.id,
        run.periodStart,
        run.periodEnd,
      );
      computed.push({
        candidate,
        compensation,
        summary,
        payableDays,
        periodDays,
        factor,
        overtimeHours,
        overtimeAmount: overtimePay(overtimeHours, compensation.lines, entity, {
          expectedHoursPerDay: summary.shift?.expectedHours ?? 0,
          workingDays,
        }),
      });
    }

    await this.db.withTenant(async (m) => {
      // A recompute replaces the previous result wholesale.
      await m.delete(PayrollRunLine, { runId });
      await m.delete(PayrollRunEmployee, { runId });

      for (const row of computed) {
        const lines = row.compensation.lines.map((line) => {
          const amount = round2(line.amount * row.factor);
          return m.create(PayrollRunLine, {
            tenantId: this.db.tenantId,
            runId,
            employeeId: row.candidate.id,
            payComponentId: line.payComponentId,
            code: line.code,
            name: line.name,
            componentType: line.componentType as PayrollRunLine['componentType'],
            baseAmount: line.amount.toFixed(2),
            prorationFactor: row.factor.toFixed(4),
            amount: amount.toFixed(2),
            currencyCode: row.compensation.currencyCode,
          });
        });
        if (lines.length > 0) {
          await m.save(lines);
        }

        // Approved overtime adds to gross alongside the component lines.
        const gross = round2(
          sum(lines.filter((l) => l.componentType !== 'deduction')) +
            row.overtimeAmount,
        );
        const deductions = round2(
          sum(lines.filter((l) => l.componentType === 'deduction')),
        );
        await m.save(
          m.create(PayrollRunEmployee, {
            tenantId: this.db.tenantId,
            runId,
            employeeId: row.candidate.id,
            currencyCode: row.compensation.currencyCode,
            payableDays: row.payableDays,
            periodDays: row.periodDays,
            prorationFactor: row.factor.toFixed(4),
            presentDays: row.summary.totals.presentDays,
            absentDays: row.summary.totals.absentDays,
            leaveDays: row.summary.totals.leaveDays,
            workedHours: row.summary.totals.workedHours.toFixed(2),
            // Approved hours only, and what they pay at the entity multiplier.
            overtimeHours: row.overtimeHours.toFixed(2),
            overtimeAmount: row.overtimeAmount.toFixed(2),
            gross: gross.toFixed(2),
            deductions: deductions.toFixed(2),
            net: round2(gross - deductions).toFixed(2),
          }),
        );
      }
      await m.update(PayrollRun, { id: runId }, { updatedAt: new Date() });
    });

    return this.get(runId);
  }

  async get(runId: string): Promise<RunView> {
    return this.db.withTenant(async (m) => {
      const run = await m.findOne(PayrollRun, { where: { id: runId } });
      if (!run) {
        throw new NotFoundException('Payroll run not found.');
      }
      const employees = (await m.query(
        `SELECT pre.employee_id AS "employeeId",
                e.employee_code AS "employeeCode",
                e.first_name || ' ' || e.last_name AS name,
                pre.currency_code AS "currencyCode",
                pre.payable_days AS "payableDays",
                pre.period_days AS "periodDays",
                pre.proration_factor::float AS "prorationFactor",
                pre.present_days AS "presentDays",
                pre.absent_days AS "absentDays",
                pre.leave_days AS "leaveDays",
                pre.worked_hours::float AS "workedHours",
                pre.overtime_hours::float AS "overtimeHours",
                pre.overtime_amount::float AS "overtimeAmount",
                pre.gross::float AS gross,
                pre.deductions::float AS deductions,
                pre.net::float AS net
           FROM payroll_run_employees pre
           JOIN employees e ON e.id = pre.employee_id
          WHERE pre.run_id = $1
          ORDER BY e.employee_code`,
        [runId],
      )) as RunEmployeeView[];

      const lines = (await m.query(
        `SELECT employee_id AS "employeeId",
                code, name,
                component_type AS "componentType",
                base_amount::float AS "baseAmount",
                proration_factor::float AS "prorationFactor",
                amount::float AS amount
           FROM payroll_run_lines
          WHERE run_id = $1
          ORDER BY CASE component_type
                     WHEN 'basic' THEN 0
                     WHEN 'allowance' THEN 1
                     WHEN 'bonus' THEN 2
                     ELSE 3
                   END, name`,
        [runId],
      )) as (RunEmployeeView['lines'][number] & { employeeId: string })[];

      for (const employee of employees) {
        employee.lines = lines.filter((l) => l.employeeId === employee.employeeId);
      }
      return {
        ...run,
        employees,
        totals: {
          employees: employees.length,
          gross: round2(employees.reduce((t, e) => t + e.gross, 0)),
          deductions: round2(employees.reduce((t, e) => t + e.deductions, 0)),
          net: round2(employees.reduce((t, e) => t + e.net, 0)),
        },
      };
    });
  }

  async remove(runId: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const result = await m.delete(PayrollRun, { id: runId });
      if (!result.affected) {
        throw new NotFoundException('Payroll run not found.');
      }
      await this.audit.record(
        {
          action: 'payroll_run.delete',
          resourceType: 'payroll_run',
          resourceId: runId,
        },
        m,
      );
    });
  }

  // Employees of the entity whose employment overlaps the period. A leaver is
  // still paid for the part they worked, so selection is by employment dates
  // rather than current status.
  private async candidates(
    m: EntityManager,
    run: PayrollRun,
  ): Promise<Candidate[]> {
    const rows = (await m.query(
      `SELECT e.id,
              to_char(e.hire_date, 'YYYY-MM-DD') AS "hireDate",
              to_char(
                (SELECT max(eh.effective_date)
                   FROM employment_history eh
                  WHERE eh.employee_id = e.id
                    AND eh.status = 'terminated'), 'YYYY-MM-DD'
              ) AS "terminatedOn"
         FROM employees e
        WHERE e.legal_entity_id = $1
          AND (e.hire_date IS NULL OR e.hire_date <= $2)
        ORDER BY e.employee_code`,
      [run.legalEntityId, run.periodEnd],
    )) as Candidate[];

    // Someone who left before the period started is not in this run.
    return rows.filter(
      (r) => !r.terminatedOn || r.terminatedOn >= run.periodStart,
    );
  }

  private async holidays(m: EntityManager, run: PayrollRun): Promise<string[]> {
    const rows = (await m.query(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS day
         FROM holidays
        WHERE (legal_entity_id IS NULL OR legal_entity_id = $1)
          AND holiday_date BETWEEN $2 AND $3`,
      [run.legalEntityId, run.periodStart, run.periodEnd],
    )) as { day: string }[];
    return rows.map((r) => r.day);
  }
}

function requireDate(value: string | undefined, field: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date.`);
  }
  return value;
}

function laterOf(periodStart: string, hireDate: string | null): string {
  return hireDate && hireDate > periodStart ? hireDate : periodStart;
}

function earlierOf(periodEnd: string, terminatedOn: string | null): string {
  return terminatedOn && terminatedOn < periodEnd ? terminatedOn : periodEnd;
}

// Days between two dates inclusive, counted on the entity's basis. A working day
// excludes weekends and the entity's holidays; rest days are Sat/Sun until
// per-entity rest days land (deferred in T-1C.9).
function countDays(
  from: string,
  to: string,
  basis: string,
  holidays: string[],
): number {
  if (to < from) {
    return 0;
  }
  const holidaySet = new Set(holidays);
  let days = 0;
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (basis === 'calendar_days') {
      days += 1;
      continue;
    }
    const day = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) {
      days += 1;
    }
  }
  return days;
}

// Guarded against a period with no countable days, which would otherwise divide
// by zero; nothing to prorate against means nothing to reduce.
function prorationFactor(payableDays: number, periodDays: number): number {
  if (periodDays <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, payableDays / periodDays));
}

// What approved overtime pays, per the entity's configured rule (O-08):
// base / divisor x multiplier x approved hours.
//
// Overtime is not prorated for a joiner: the hours were worked, so they are paid
// in full.
//
// Returns 0 when the rate cannot be derived (no pay to base it on, or an
// expected-hours divisor with no shift). The run stores the hours regardless, so
// hours without an amount stay visible rather than silently vanishing.
function overtimePay(
  hours: number,
  lines: { componentType: string; amount: number }[],
  entity: LegalEntity,
  period: { expectedHoursPerDay: number; workingDays: number },
): number {
  if (hours <= 0) {
    return 0;
  }
  const base =
    entity.overtimeBase === 'gross'
      ? lines
          .filter((l) => l.componentType !== 'deduction')
          .reduce((total, l) => total + l.amount, 0)
      : (lines.find((l) => l.componentType === 'basic')?.amount ?? 0);

  // A fixed divisor is a statutory hours-per-month figure and ignores the
  // calendar, which is also why it is immune to the rest-day assumption.
  const divisor =
    entity.overtimeDivisor === 'fixed_hours'
      ? Number(entity.overtimeFixedHours ?? 0)
      : period.expectedHoursPerDay * period.workingDays;

  if (base <= 0 || divisor <= 0) {
    return 0;
  }
  return round2((base / divisor) * Number(entity.overtimeMultiplier) * hours);
}

function sum(lines: { amount: string }[]): number {
  return lines.reduce((total, line) => total + Number(line.amount), 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
