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
import { AdjustmentService } from './adjustment.service';
import { CompensationService } from './compensation.service';
import { StatutoryCharge, StatutoryService, chargesFor } from './statutory.service';
import { ApprovalView, WorkflowService } from '../workflow/workflow.service';
import {
  assertDraft,
  countDays,
  earlierOf,
  laterOf,
  overtimePay,
  previewIssues,
  prorationFactor,
  requireDate,
  round2,
  RunIssue,
  sum,
} from './payroll-math';

export { RunIssue } from './payroll-math';

// Separation of duties (O-09, PR-05): HR prepares and locks the run, and a
// tenant admin approves it. Routing this to hr_admin would make the preparer the
// approver, which is exactly what an approval before disbursement exists to
// prevent (FR-M4-07).
const PAYROLL_APPROVER_ROLES = ['tenant_admin'];

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
  charges: StatutoryCharge[];
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
  // Signed total of off-cycle adjustments settled into this run (T-2.5).
  adjustments: number;
  net: number;
  employerContributions: number;
  lines: {
    code: string;
    name: string;
    componentType: string;
    source: string;
    baseAmount: number;
    prorationFactor: number;
    amount: number;
  }[];
  // Each settled adjustment with its reason, for the run detail and payslip.
  adjustmentLines: {
    reason: string;
    amount: number;
    sourceRunId: string | null;
  }[];
}

// A run in the list, with the preview issues that decide whether it can lock.
export interface PayrollRunListItem extends PayrollRun {
  issues: RunIssue[];
}

export interface RunView extends PayrollRun {
  employees: RunEmployeeView[];
  issues: RunIssue[];
  totals: {
    employees: number;
    gross: number;
    deductions: number;
    adjustments: number;
    net: number;
    employerContributions: number;
  };
}

@Injectable()
export class PayrollRunService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly summaries: SummaryService,
    private readonly compensation: CompensationService,
    private readonly overtime: OvertimeService,
    private readonly statutory: StatutoryService,
    private readonly workflow: WorkflowService,
    private readonly adjustments: AdjustmentService,
  ) {
    this.workflow.onDecided('payroll_run', (view, m) => this.onDecided(view, m));
  }

  // Lists runs with their preview issues attached, because the lock action sits
  // on the list: a warning only visible after expanding a run would be missed
  // exactly when it matters.
  //
  // Issues are computed for drafts only. A locked or approved run cannot be
  // acted on, so its preview is moot, and skipping it keeps this to a bounded
  // amount of work however many runs have accumulated.
  async list(legalEntityId?: string): Promise<PayrollRunListItem[]> {
    return this.db.withTenant(async (m) => {
      const runs = await m.find(PayrollRun, {
        where: legalEntityId ? { legalEntityId } : {},
        order: { periodStart: 'DESC', createdAt: 'DESC' },
      });
      const drafts = runs.filter((r) => r.status === 'draft').map((r) => r.id);
      if (drafts.length === 0) {
        return runs.map((run) => ({ ...run, issues: [] }));
      }

      // One query for every draft's employees, one for their lines, rather than
      // a round trip per run.
      const employees = (await m.query(
        `SELECT pre.run_id AS "runId",
                pre.employee_id AS "employeeId",
                e.employee_code AS "employeeCode",
                pre.net::float AS net,
                pre.absent_days AS "absentDays",
                pre.overtime_hours::float AS "overtimeHours",
                pre.overtime_amount::float AS "overtimeAmount"
           FROM payroll_run_employees pre
           JOIN employees e ON e.id = pre.employee_id
          WHERE pre.run_id = ANY($1)`,
        [drafts],
      )) as (Pick<
        RunEmployeeView,
        'employeeId' | 'employeeCode' | 'net' | 'absentDays' | 'overtimeHours' | 'overtimeAmount'
      > & { runId: string })[];

      const lineCounts = (await m.query(
        `SELECT run_id AS "runId", employee_id AS "employeeId", count(*)::int AS lines
           FROM payroll_run_lines
          WHERE run_id = ANY($1)
          GROUP BY run_id, employee_id`,
        [drafts],
      )) as { runId: string; employeeId: string; lines: number }[];

      return runs.map((run) => {
        if (run.status !== 'draft') {
          return { ...run, issues: [] };
        }
        // previewIssues only reads the fields gathered above, but it is shared
        // with the detail view so the two can never disagree.
        const rows = employees
          .filter((e) => e.runId === run.id)
          .map((e) => ({
            ...e,
            lines: new Array(
              lineCounts.find(
                (l) => l.runId === run.id && l.employeeId === e.employeeId,
              )?.lines ?? 0,
            ).fill({}),
          })) as unknown as RunEmployeeView[];
        return { ...run, issues: previewIssues(rows) };
      });
    });
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
        // A locked run is the record of what was approved and paid; correcting
        // it means an off-cycle adjustment, never a rewrite (D-09, FR-AT-41).
        assertDraft(found, 'recomputed');
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

    // The rules in force at the cut-off, so a rate change after the period does
    // not reach back into it (FR-M4-06).
    const statutoryRules = await this.statutory.inForce(
      run.legalEntityId,
      run.cutoffDate,
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
      const overtimeAmount = overtimePay(overtimeHours, compensation.lines, entity, {
        expectedHoursPerDay: summary.shift?.expectedHours ?? 0,
        workingDays,
      });

      // Statutory rates apply to what is actually earned this period, so the
      // base is the prorated pay plus approved overtime, not the full salary.
      const proratedBasic = round2(
        (compensation.lines.find((l) => l.componentType === 'basic')?.amount ??
          0) * factor,
      );
      const proratedGross = round2(
        compensation.lines
          .filter((l) => l.componentType !== 'deduction')
          .reduce((total, l) => total + l.amount * factor, 0) + overtimeAmount,
      );

      computed.push({
        candidate,
        compensation,
        summary,
        payableDays,
        periodDays,
        factor,
        overtimeHours,
        overtimeAmount,
        charges: chargesFor(statutoryRules, proratedBasic, proratedGross),
      });
    }

    await this.db.withTenant(async (m) => {
      // A recompute replaces the previous result wholesale.
      await m.delete(PayrollRunLine, { runId });
      await m.delete(PayrollRunEmployee, { runId });

      // Release any adjustments this (draft) run had settled, so a recompute
      // re-picks them up cleanly. A locked run never reaches here (compute is
      // draft-only), so a settled-and-frozen adjustment is safe.
      await m.query(
        `UPDATE payroll_adjustments
            SET settled_run_id = NULL, status = 'approved', updated_at = now()
          WHERE settled_run_id = $1`,
        [runId],
      );

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
            source: 'component' as const,
            baseAmount: line.amount.toFixed(2),
            prorationFactor: row.factor.toFixed(4),
            amount: amount.toFixed(2),
            currencyCode: row.compensation.currencyCode,
          });
        });

        // Statutory deductions are computed, not drawn from the catalog, so they
        // carry no component id and are already period amounts (the proration is
        // in their base). Marked 'statutory' so a payslip can tell them apart.
        const statutoryLines = row.charges
          .filter((c) => c.employee > 0)
          .map((charge) =>
            m.create(PayrollRunLine, {
              tenantId: this.db.tenantId,
              runId,
              employeeId: row.candidate.id,
              payComponentId: null,
              code: charge.code,
              name: charge.name,
              componentType: 'deduction' as const,
              source: 'statutory' as const,
              baseAmount: charge.base.toFixed(2),
              prorationFactor: '1.0000',
              amount: charge.employee.toFixed(2),
              currencyCode: row.compensation.currencyCode,
            }),
          );

        const allLines = [...lines, ...statutoryLines];
        if (allLines.length > 0) {
          await m.save(allLines);
        }

        // Approved overtime adds to gross alongside the component lines.
        const gross = round2(
          sum(allLines.filter((l) => l.componentType !== 'deduction')) +
            row.overtimeAmount,
        );
        // Both catalog and statutory deductions reduce net.
        const deductions = round2(
          sum(allLines.filter((l) => l.componentType === 'deduction')),
        );
        // Employer contributions are a cost of employment, not a deduction:
        // they never touch net (FR-M10-01).
        const employerContributions = round2(
          row.charges.reduce((total, c) => total + c.employer, 0),
        );

        // Settle this employee's approved, unsettled off-cycle adjustments into
        // this run (T-2.5). Signed: they add to or claw back from net.
        const pending = (await m.query(
          `SELECT COALESCE(SUM(amount), 0)::float AS total
             FROM payroll_adjustments
            WHERE employee_id = $1
              AND legal_entity_id = $2
              AND status = 'approved'
              AND settled_run_id IS NULL`,
          [row.candidate.id, run.legalEntityId],
        )) as { total: number }[];
        const adjustments = round2(pending[0]?.total ?? 0);
        if (adjustments !== 0) {
          await m.query(
            `UPDATE payroll_adjustments
                SET status = 'settled', settled_run_id = $1, updated_at = now()
              WHERE employee_id = $2
                AND legal_entity_id = $3
                AND status = 'approved'
                AND settled_run_id IS NULL`,
            [runId, row.candidate.id, run.legalEntityId],
          );
        }

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
            adjustments: adjustments.toFixed(2),
            // Off-cycle adjustments correct net directly, after deductions.
            net: round2(gross - deductions + adjustments).toFixed(2),
            employerContributions: employerContributions.toFixed(2),
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
                pre.adjustments::float AS adjustments,
                pre.net::float AS net,
                pre.employer_contributions::float AS "employerContributions"
           FROM payroll_run_employees pre
           JOIN employees e ON e.id = pre.employee_id
          WHERE pre.run_id = $1
          ORDER BY e.employee_code`,
        [runId],
      )) as RunEmployeeView[];

      // The individual off-cycle adjustments settled into this run, so the run
      // and payslip can show each with its reason rather than just a total.
      const settled = (await m.query(
        `SELECT employee_id AS "employeeId", reason, amount::float AS amount,
                source_run_id AS "sourceRunId"
           FROM payroll_adjustments
          WHERE settled_run_id = $1
          ORDER BY created_at`,
        [runId],
      )) as {
        employeeId: string;
        reason: string;
        amount: number;
        sourceRunId: string | null;
      }[];

      const lines = (await m.query(
        `SELECT employee_id AS "employeeId",
                code, name,
                component_type AS "componentType",
                source,
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
                   END, source, name`,
        [runId],
      )) as (RunEmployeeView['lines'][number] & { employeeId: string })[];

      for (const employee of employees) {
        employee.lines = lines.filter((l) => l.employeeId === employee.employeeId);
        employee.adjustmentLines = settled.filter(
          (a) => a.employeeId === employee.employeeId,
        );
      }
      return {
        ...run,
        employees,
        issues: previewIssues(employees),
        totals: {
          employees: employees.length,
          gross: round2(employees.reduce((t, e) => t + e.gross, 0)),
          deductions: round2(employees.reduce((t, e) => t + e.deductions, 0)),
          adjustments: round2(employees.reduce((t, e) => t + e.adjustments, 0)),
          net: round2(employees.reduce((t, e) => t + e.net, 0)),
          employerContributions: round2(
            employees.reduce((t, e) => t + e.employerContributions, 0),
          ),
        },
      };
    });
  }

  // Freezes the run and routes it for approval (FR-M4-07). Blocking preview
  // issues stop this: a run that would pay someone nothing, or pay a negative
  // amount, is a data gap rather than a decision to approve.
  async lock(runId: string, user: AuthUser): Promise<RunView> {
    const view = await this.get(runId);
    assertDraft(view, 'locked');

    const blocking = view.issues.filter((i) => i.severity === 'blocking');
    if (blocking.length > 0) {
      throw new BadRequestException(
        `This run cannot be locked yet: ${blocking
          .map((b) => (b.employeeCode ? `${b.employeeCode}, ${b.message}` : b.message))
          .join('; ')}`,
      );
    }

    await this.db.withTenant(async (m) => {
      const approval = await this.workflow.createRequest(
        {
          requestType: 'payroll_run',
          resourceType: 'payroll',
          resourceId: runId,
          payload: {
            periodStart: view.periodStart,
            periodEnd: view.periodEnd,
            employees: view.totals.employees,
            net: view.totals.net,
            currencyCode: view.currencyCode,
          },
          approverRoles: PAYROLL_APPROVER_ROLES,
        },
        m,
      );
      await m.update(
        PayrollRun,
        { id: runId },
        {
          status: 'locked',
          lockedAt: new Date(),
          lockedBy: user.sub,
          approvalRequestId: approval.request.id,
        },
      );
      await this.audit.record(
        {
          action: 'payroll_run.lock',
          resourceType: 'payroll_run',
          resourceId: runId,
          after: { net: view.totals.net, employees: view.totals.employees },
        },
        m,
      );
    });
    return this.get(runId);
  }

  // Reflects the decision on the locked run: approving clears it for
  // disbursement, and a rejection returns it to draft so it can be corrected
  // and locked again.
  private async onDecided(view: ApprovalView, m: EntityManager): Promise<void> {
    const where = { approvalRequestId: view.request.id, status: 'locked' as const };
    if (view.request.status === 'approved') {
      await m.update(PayrollRun, where, { status: 'approved', approvedAt: new Date() });
      return;
    }
    await m.update(PayrollRun, where, {
      status: 'draft',
      lockedAt: null,
      lockedBy: null,
      approvalRequestId: null,
    });
  }

  async remove(runId: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const found = await m.findOne(PayrollRun, { where: { id: runId } });
      if (!found) {
        throw new NotFoundException('Payroll run not found.');
      }
      assertDraft(found, 'deleted');
      // Release its settled adjustments so they return to the pool for the next
      // run. ON DELETE SET NULL would clear settled_run_id but leave the status
      // 'settled', stranding them; reset both.
      await m.query(
        `UPDATE payroll_adjustments
            SET settled_run_id = NULL, status = 'approved', updated_at = now()
          WHERE settled_run_id = $1`,
        [runId],
      );
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
  //
  // Erased employees are excluded outright: erasure anonymizes the record under
  // a data-subject request, so there is no one left to pay. They also cannot be
  // filtered by termination date, because erasure sets the status directly and
  // records no employment_history row, which would otherwise read as "never
  // terminated" and put them in every run forever.
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
          AND e.erased_at IS NULL
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
