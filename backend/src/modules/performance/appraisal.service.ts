import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Appraisal } from '../../entities/appraisal.entity';
import {
  AppraisalOutcome,
  OutcomeType,
} from '../../entities/appraisal-outcome.entity';
import { RatingScale } from '../../entities/rating-scale.entity';
import { ReviewCycle } from '../../entities/review-cycle.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { hasPermission } from '../auth/permissions';
import { EmployeeService } from '../employees/employee.service';
import { CompensationService } from '../payroll/compensation.service';

const OUTCOME_TYPES: OutcomeType[] = ['none', 'promotion', 'increment', 'pip'];

export interface AppraisalView {
  id: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  selfRating: number | null;
  selfComments: string | null;
  managerRating: number | null;
  managerComments: string | null;
  finalRating: number | null;
  status: string;
  outcome: OutcomeView | null;
}

export interface OutcomeView {
  outcomeType: string;
  incrementAmount: number | null;
  incrementEffectiveDate: string | null;
  newJobTitle: string | null;
  developmentAreas: string | null;
  compensationApplied: boolean;
  appliedAt: string | null;
}

export interface OutcomeInput {
  outcomeType?: OutcomeType;
  incrementAmount?: number | null;
  incrementEffectiveDate?: string | null;
  newJobTitle?: string | null;
  developmentAreas?: string | null;
}

// Appraisals: self review, manager review, calibration, and outcomes (T-3.2,
// FR-M6-05, FR-M6-06). An increment outcome is applied as a compensation raise
// so every future payroll run pays the new salary.
@Injectable()
export class AppraisalService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly compensation: CompensationService,
  ) {}

  // --- Employee self-service.

  async mine(user: AuthUser): Promise<AppraisalView[]> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant((m) => this.views(m, { employeeId: me.id }));
  }

  async selfReview(
    user: AuthUser,
    id: string,
    rating: number,
    comments?: string,
  ): Promise<AppraisalView> {
    const me = await this.employees.myProfile(user.sub, user.email);
    await this.db.withTenant(async (m) => {
      const appraisal = await this.openAppraisal(m, id);
      if (appraisal.employeeId !== me.id) {
        throw new NotFoundException('Appraisal not found.');
      }
      await this.assertRating(m, appraisal.cycleId, rating);
      appraisal.selfRating = rating;
      appraisal.selfComments = comments?.trim() || null;
      if (appraisal.status === 'pending') {
        appraisal.status = 'self_review';
      }
      await m.save(appraisal);
      await this.audit.record(
        {
          action: 'appraisal.self_review',
          resourceType: 'appraisal',
          resourceId: id,
          after: { rating },
        },
        m,
      );
    });
    return this.get(id);
  }

  // --- Manager / HR.

  listForCycle(cycleId: string): Promise<AppraisalView[]> {
    return this.db.withTenant((m) => this.views(m, { cycleId }));
  }

  get(id: string): Promise<AppraisalView> {
    return this.db.withTenant(async (m) => {
      const [view] = await this.views(m, { id });
      if (!view) {
        throw new NotFoundException('Appraisal not found.');
      }
      return view;
    });
  }

  async managerReview(
    user: AuthUser,
    id: string,
    rating: number,
    comments?: string,
  ): Promise<AppraisalView> {
    await this.db.withTenant(async (m) => {
      const appraisal = await this.openAppraisal(m, id);
      await this.assertManagerOrHr(m, user, appraisal.employeeId);
      await this.assertRating(m, appraisal.cycleId, rating);
      appraisal.managerRating = rating;
      appraisal.managerComments = comments?.trim() || null;
      appraisal.status = 'manager_review';
      await m.save(appraisal);
      await this.audit.record(
        {
          action: 'appraisal.manager_review',
          resourceType: 'appraisal',
          resourceId: id,
          after: { rating },
        },
        m,
      );
    });
    return this.get(id);
  }

  // HR sets the final rating during calibration.
  async calibrate(id: string, finalRating: number): Promise<AppraisalView> {
    await this.db.withTenant(async (m) => {
      const appraisal = await m.findOne(Appraisal, { where: { id } });
      if (!appraisal) {
        throw new NotFoundException('Appraisal not found.');
      }
      const cycle = await m.findOne(ReviewCycle, {
        where: { id: appraisal.cycleId },
      });
      if (cycle?.status !== 'calibration') {
        throw new BadRequestException(
          'Final ratings are set while the cycle is in calibration.',
        );
      }
      await this.assertRating(m, appraisal.cycleId, finalRating);
      appraisal.finalRating = finalRating;
      appraisal.status = 'calibrated';
      await m.save(appraisal);
      await this.audit.record(
        {
          action: 'appraisal.calibrate',
          resourceType: 'appraisal',
          resourceId: id,
          after: { finalRating },
        },
        m,
      );
    });
    return this.get(id);
  }

  // Records the outcome (promotion, increment, PIP) and development areas. The
  // appraisal must be calibrated so an outcome rests on a final rating.
  async setOutcome(
    user: AuthUser,
    id: string,
    input: OutcomeInput,
  ): Promise<AppraisalView> {
    const outcomeType = input.outcomeType ?? 'none';
    if (!OUTCOME_TYPES.includes(outcomeType)) {
      throw new BadRequestException('Unknown outcome type.');
    }
    if (outcomeType === 'increment') {
      if (
        typeof input.incrementAmount !== 'number' ||
        input.incrementAmount <= 0
      ) {
        throw new BadRequestException('An increment needs a positive amount.');
      }
      if (!input.incrementEffectiveDate) {
        throw new BadRequestException('An increment needs an effective date.');
      }
    }
    if (outcomeType === 'promotion' && !input.newJobTitle?.trim()) {
      throw new BadRequestException('A promotion needs a new job title.');
    }
    await this.db.withTenant(async (m) => {
      const appraisal = await m.findOne(Appraisal, { where: { id } });
      if (!appraisal) {
        throw new NotFoundException('Appraisal not found.');
      }
      if (appraisal.finalRating == null) {
        throw new BadRequestException(
          'Calibrate the appraisal (set a final rating) before recording an outcome.',
        );
      }
      const existing = await m.findOne(AppraisalOutcome, {
        where: { appraisalId: id },
      });
      if (existing?.compensationApplied) {
        throw new BadRequestException(
          'This outcome has already been applied to pay and cannot be changed.',
        );
      }
      const outcome =
        existing ??
        m.create(AppraisalOutcome, {
          tenantId: this.db.tenantId,
          appraisalId: id,
        });
      outcome.outcomeType = outcomeType;
      outcome.incrementAmount =
        outcomeType === 'increment'
          ? (input.incrementAmount as number).toFixed(2)
          : null;
      outcome.incrementEffectiveDate =
        outcomeType === 'increment'
          ? (input.incrementEffectiveDate as string)
          : null;
      outcome.newJobTitle =
        outcomeType === 'promotion'
          ? (input.newJobTitle as string).trim()
          : input.newJobTitle?.trim() || null;
      outcome.developmentAreas = input.developmentAreas?.trim() || null;
      outcome.createdBySub = user.sub;
      await m.save(outcome);
      await this.audit.record(
        {
          action: 'appraisal.outcome',
          resourceType: 'appraisal',
          resourceId: id,
          after: { outcomeType },
        },
        m,
      );
    });
    return this.get(id);
  }

  // Applies the outcome to pay (FR-M6-06): an increment raises the base salary
  // from the effective date; a promotion updates the job title. Guarded so the
  // raise is applied only once.
  async applyOutcome(id: string): Promise<AppraisalView> {
    const plan = await this.db.withTenant(async (m) => {
      const appraisal = await m.findOne(Appraisal, { where: { id } });
      if (!appraisal) {
        throw new NotFoundException('Appraisal not found.');
      }
      const outcome = await m.findOne(AppraisalOutcome, {
        where: { appraisalId: id },
      });
      if (!outcome || outcome.outcomeType === 'none') {
        throw new BadRequestException(
          'This appraisal has no actionable outcome.',
        );
      }
      if (outcome.compensationApplied) {
        throw new BadRequestException('This outcome has already been applied.');
      }
      return { employeeId: appraisal.employeeId, outcome };
    });

    // Raise base pay via the compensation service (its own tenant transaction),
    // like the offer flow calls the employee service outside the block.
    if (plan.outcome.outcomeType === 'increment') {
      const current = await this.compensation.forEmployee(plan.employeeId);
      const base = current.lines.find((l) => l.code === 'BASIC');
      if (!base) {
        throw new BadRequestException(
          'This employee has no base salary component to increase.',
        );
      }
      const raised = base.amount + Number(plan.outcome.incrementAmount);
      await this.compensation.set(plan.employeeId, {
        payComponentId: base.payComponentId,
        amount: raised,
        effectiveFrom: plan.outcome.incrementEffectiveDate ?? undefined,
      });
    }
    if (plan.outcome.newJobTitle) {
      await this.employees.update(plan.employeeId, {
        jobTitle: plan.outcome.newJobTitle,
      });
    }

    await this.db.withTenant(async (m) => {
      const outcome = await m.findOne(AppraisalOutcome, {
        where: { appraisalId: id },
      });
      if (!outcome) {
        return;
      }
      outcome.compensationApplied = true;
      outcome.appliedAt = new Date();
      await m.save(outcome);
      await this.audit.record(
        {
          action: 'appraisal.outcome_applied',
          resourceType: 'appraisal',
          resourceId: id,
          after: { outcomeType: outcome.outcomeType },
        },
        m,
      );
    });
    return this.get(id);
  }

  // --- Internals.

  private async openAppraisal(
    m: EntityManager,
    id: string,
  ): Promise<Appraisal> {
    const appraisal = await m.findOne(Appraisal, { where: { id } });
    if (!appraisal) {
      throw new NotFoundException('Appraisal not found.');
    }
    const cycle = await m.findOne(ReviewCycle, {
      where: { id: appraisal.cycleId },
    });
    if (cycle?.status !== 'active') {
      throw new BadRequestException(
        'Reviews can be entered only while the cycle is active.',
      );
    }
    return appraisal;
  }

  private async assertManagerOrHr(
    m: EntityManager,
    user: AuthUser,
    employeeId: string,
  ): Promise<void> {
    if (hasPermission(user.permissions, 'performance:manage')) {
      return;
    }
    // Otherwise the caller must be the employee's manager.
    const me = await this.employees.myProfile(user.sub, user.email);
    const [row] = (await m.query(
      `SELECT manager_id AS "managerId" FROM employees WHERE id = $1`,
      [employeeId],
    )) as { managerId: string | null }[];
    if (!row || row.managerId !== me.id) {
      throw new ForbiddenException(
        "Only the employee's manager or HR can enter a manager review.",
      );
    }
  }

  private async assertRating(
    m: EntityManager,
    cycleId: string,
    rating: number,
  ): Promise<void> {
    const cycle = await m.findOne(ReviewCycle, { where: { id: cycleId } });
    const scale = cycle
      ? await m.findOne(RatingScale, { where: { id: cycle.ratingScaleId } })
      : null;
    const allowed = (scale?.points ?? []).map((p) => p.value);
    if (!allowed.includes(rating)) {
      throw new BadRequestException(
        `Rating must be one of ${allowed.join(', ')} on this cycle's scale.`,
      );
    }
  }

  private async views(
    m: EntityManager,
    where: { id?: string; cycleId?: string; employeeId?: string },
  ): Promise<AppraisalView[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (where.id) {
      params.push(where.id);
      clauses.push(`a.id = $${params.length}`);
    }
    if (where.cycleId) {
      params.push(where.cycleId);
      clauses.push(`a.cycle_id = $${params.length}`);
    }
    if (where.employeeId) {
      params.push(where.employeeId);
      clauses.push(`a.employee_id = $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = (await m.query(
      `SELECT a.id,
              a.cycle_id AS "cycleId",
              c.name AS "cycleName",
              c.status AS "cycleStatus",
              a.employee_id AS "employeeId",
              e.first_name || ' ' || e.last_name AS "employeeName",
              e.employee_code AS "employeeCode",
              a.self_rating AS "selfRating",
              a.self_comments AS "selfComments",
              a.manager_rating AS "managerRating",
              a.manager_comments AS "managerComments",
              a.final_rating AS "finalRating",
              a.status,
              o.outcome_type AS "outcomeType",
              o.increment_amount::float AS "incrementAmount",
              to_char(o.increment_effective_date, 'YYYY-MM-DD') AS "incrementEffectiveDate",
              o.new_job_title AS "newJobTitle",
              o.development_areas AS "developmentAreas",
              o.compensation_applied AS "compensationApplied",
              to_char(o.applied_at, 'YYYY-MM-DD"T"HH24:MI') AS "appliedAt"
         FROM appraisals a
         JOIN review_cycles c ON c.id = a.cycle_id
         JOIN employees e ON e.id = a.employee_id
         LEFT JOIN appraisal_outcomes o ON o.appraisal_id = a.id
         ${filter}
        ORDER BY e.employee_code ASC`,
      params,
    )) as (Omit<AppraisalView, 'outcome'> & OutcomeRow)[];
    return rows.map((r) => {
      const {
        outcomeType,
        incrementAmount,
        incrementEffectiveDate,
        newJobTitle,
        developmentAreas,
        compensationApplied,
        appliedAt,
        ...appraisal
      } = r;
      const outcome: OutcomeView | null = outcomeType
        ? {
            outcomeType,
            incrementAmount,
            incrementEffectiveDate,
            newJobTitle,
            developmentAreas,
            compensationApplied: compensationApplied ?? false,
            appliedAt,
          }
        : null;
      return { ...appraisal, outcome };
    });
  }
}

// The outcome columns joined onto an appraisal row, folded into `outcome`.
interface OutcomeRow {
  outcomeType: string | null;
  incrementAmount: number | null;
  incrementEffectiveDate: string | null;
  newJobTitle: string | null;
  developmentAreas: string | null;
  compensationApplied: boolean | null;
  appliedAt: string | null;
}
