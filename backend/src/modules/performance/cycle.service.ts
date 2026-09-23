import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Appraisal } from '../../entities/appraisal.entity';
import { CycleType, ReviewCycle } from '../../entities/review-cycle.entity';
import { RatingPoint, RatingScale } from '../../entities/rating-scale.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';

const CYCLE_TYPES: CycleType[] = ['annual', 'quarterly', 'probation'];

const DEFAULT_SCALE: RatingPoint[] = [
  { value: 1, label: 'Unsatisfactory' },
  { value: 2, label: 'Needs improvement' },
  { value: 3, label: 'Meets expectations' },
  { value: 4, label: 'Exceeds expectations' },
  { value: 5, label: 'Outstanding' },
];

export interface CreateCycleInput {
  name?: string;
  cycleType?: CycleType;
  periodStart?: string;
  periodEnd?: string;
  ratingScaleId?: string;
}

export interface CycleView {
  id: string;
  name: string;
  cycleType: string;
  periodStart: string;
  periodEnd: string;
  ratingScaleId: string;
  status: string;
  appraisals: number;
  createdAt: string;
}

export interface CalibrationRow {
  appraisalId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  status: string;
  selfRating: number | null;
  managerRating: number | null;
  finalRating: number | null;
  outcomeType: string | null;
}

export interface CalibrationView {
  cycle: CycleView;
  scale: RatingPoint[];
  rows: CalibrationRow[];
  // Count of appraisals at each final rating (falling back to manager rating),
  // so a calibrator can see and normalize the distribution.
  distribution: { value: number; label: string; count: number }[];
}

// Review cycles and their rating scales (T-3.2, FR-M6-02, FR-M6-05).
@Injectable()
export class CycleService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  // --- Rating scales.

  listScales(): Promise<RatingScale[]> {
    return this.db.withTenant(async (m) => {
      await this.ensureDefaultScale(m);
      return m.find(RatingScale, { order: { createdAt: 'ASC' } });
    });
  }

  async createScale(name: string, points: RatingPoint[]): Promise<RatingScale> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('A rating scale needs a name.');
    }
    if (!Array.isArray(points) || points.length < 2) {
      throw new BadRequestException(
        'A rating scale needs at least two points.',
      );
    }
    return this.db.withTenant(async (m) => {
      const duplicate = await m.findOne(RatingScale, {
        where: { name: trimmed },
      });
      if (duplicate) {
        throw new BadRequestException(
          `A scale named "${trimmed}" already exists.`,
        );
      }
      return m.save(
        m.create(RatingScale, {
          tenantId: this.db.tenantId,
          name: trimmed,
          points,
        }),
      );
    });
  }

  // --- Cycles.

  list(): Promise<CycleView[]> {
    return this.db.withTenant((m) => this.views(m, {}));
  }

  get(id: string): Promise<CycleView> {
    return this.db.withTenant(async (m) => {
      const [cycle] = await this.views(m, { id });
      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
      return cycle;
    });
  }

  async create(user: AuthUser, input: CreateCycleInput): Promise<CycleView> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('A cycle needs a name.');
    }
    const cycleType = input.cycleType ?? 'annual';
    if (!CYCLE_TYPES.includes(cycleType)) {
      throw new BadRequestException(
        'Cycle type must be annual, quarterly, or probation.',
      );
    }
    if (!input.periodStart || !input.periodEnd) {
      throw new BadRequestException('A cycle needs a start and end date.');
    }
    if (input.periodStart > input.periodEnd) {
      throw new BadRequestException(
        'The start date must be on or before the end date.',
      );
    }
    const id = await this.db.withTenant(async (m) => {
      const scale = input.ratingScaleId
        ? await m.findOne(RatingScale, { where: { id: input.ratingScaleId } })
        : await this.ensureDefaultScale(m);
      if (!scale) {
        throw new BadRequestException('Unknown rating scale.');
      }
      const cycle = await m.save(
        m.create(ReviewCycle, {
          tenantId: this.db.tenantId,
          name,
          cycleType,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          ratingScaleId: scale.id,
          status: 'draft',
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'review_cycle.create',
          resourceType: 'review_cycle',
          resourceId: cycle.id,
          after: { name, cycleType },
        },
        m,
      );
      return cycle.id;
    });
    return this.get(id);
  }

  // Activating a draft generates one appraisal per active employee, so everyone
  // in scope has a review to complete.
  async activate(id: string): Promise<CycleView> {
    await this.db.withTenant(async (m) => {
      const cycle = await this.cycleOrThrow(m, id);
      if (cycle.status !== 'draft') {
        throw new BadRequestException(
          `Only a draft cycle can be activated (this one is ${cycle.status}).`,
        );
      }
      const employees = await m.query(
        `SELECT id FROM employees WHERE status = 'active'`,
      );
      for (const row of employees as { id: string }[]) {
        const existing = await m.findOne(Appraisal, {
          where: { cycleId: id, employeeId: row.id },
        });
        if (!existing) {
          await m.save(
            m.create(Appraisal, {
              tenantId: this.db.tenantId,
              cycleId: id,
              employeeId: row.id,
              status: 'pending',
            }),
          );
        }
      }
      cycle.status = 'active';
      await m.save(cycle);
      await this.audit.record(
        {
          action: 'review_cycle.activate',
          resourceType: 'review_cycle',
          resourceId: id,
          after: { appraisals: employees.length },
        },
        m,
      );
    });
    return this.get(id);
  }

  async moveToCalibration(id: string): Promise<CycleView> {
    return this.transition(id, 'active', 'calibration', 'calibrate');
  }

  async close(id: string): Promise<CycleView> {
    await this.db.withTenant(async (m) => {
      const cycle = await this.cycleOrThrow(m, id);
      if (cycle.status !== 'calibration') {
        throw new BadRequestException(
          `A cycle is closed from calibration (this one is ${cycle.status}).`,
        );
      }
      cycle.status = 'closed';
      await m.save(cycle);
      // Freeze the appraisals so no further edits land after close.
      await m.query(
        `UPDATE appraisals SET status = 'closed', updated_at = now() WHERE cycle_id = $1`,
        [id],
      );
      await this.audit.record(
        {
          action: 'review_cycle.close',
          resourceType: 'review_cycle',
          resourceId: id,
        },
        m,
      );
    });
    return this.get(id);
  }

  // The calibration board: every appraisal with its ratings and the rating
  // distribution, so a calibrator can normalize before closing (FR-M6-05).
  calibration(id: string): Promise<CalibrationView> {
    return this.db.withTenant(async (m) => {
      const [cycle] = await this.views(m, { id });
      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
      const scaleRow = await m.findOne(RatingScale, {
        where: { id: cycle.ratingScaleId },
      });
      const scale = scaleRow?.points ?? DEFAULT_SCALE;
      const rows = (await m.query(
        `SELECT a.id AS "appraisalId",
                a.employee_id AS "employeeId",
                e.first_name || ' ' || e.last_name AS "employeeName",
                e.employee_code AS "employeeCode",
                a.status,
                a.self_rating AS "selfRating",
                a.manager_rating AS "managerRating",
                a.final_rating AS "finalRating",
                o.outcome_type AS "outcomeType"
           FROM appraisals a
           JOIN employees e ON e.id = a.employee_id
           LEFT JOIN appraisal_outcomes o ON o.appraisal_id = a.id
          WHERE a.cycle_id = $1
          ORDER BY e.employee_code ASC`,
        [id],
      )) as CalibrationRow[];

      const counts = new Map<number, number>();
      for (const r of rows) {
        const rating = r.finalRating ?? r.managerRating;
        if (rating != null) {
          counts.set(rating, (counts.get(rating) ?? 0) + 1);
        }
      }
      const distribution = scale.map((p) => ({
        value: p.value,
        label: p.label,
        count: counts.get(p.value) ?? 0,
      }));
      return { cycle, scale, rows, distribution };
    });
  }

  // --- Internals.

  private async transition(
    id: string,
    from: string,
    to: 'calibration',
    action: string,
  ): Promise<CycleView> {
    await this.db.withTenant(async (m) => {
      const cycle = await this.cycleOrThrow(m, id);
      if (cycle.status !== from) {
        throw new BadRequestException(
          `This cycle is ${cycle.status}, so it cannot move to ${to}.`,
        );
      }
      cycle.status = to;
      await m.save(cycle);
      await this.audit.record(
        {
          action: `review_cycle.${action}`,
          resourceType: 'review_cycle',
          resourceId: id,
        },
        m,
      );
    });
    return this.get(id);
  }

  private async cycleOrThrow(
    m: EntityManager,
    id: string,
  ): Promise<ReviewCycle> {
    const cycle = await m.findOne(ReviewCycle, { where: { id } });
    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }
    return cycle;
  }

  private async ensureDefaultScale(m: EntityManager): Promise<RatingScale> {
    const existing = await m.findOne(RatingScale, {
      where: { name: '5-point scale' },
    });
    if (existing) {
      return existing;
    }
    return m.save(
      m.create(RatingScale, {
        tenantId: this.db.tenantId,
        name: '5-point scale',
        points: DEFAULT_SCALE,
      }),
    );
  }

  private async views(
    m: EntityManager,
    where: { id?: string },
  ): Promise<CycleView[]> {
    const params: unknown[] = [];
    let filter = '';
    if (where.id) {
      params.push(where.id);
      filter = 'WHERE c.id = $1';
    }
    return (await m.query(
      `SELECT c.id,
              c.name,
              c.cycle_type AS "cycleType",
              to_char(c.period_start, 'YYYY-MM-DD') AS "periodStart",
              to_char(c.period_end, 'YYYY-MM-DD') AS "periodEnd",
              c.rating_scale_id AS "ratingScaleId",
              c.status,
              (SELECT count(*)::int FROM appraisals a WHERE a.cycle_id = c.id) AS "appraisals",
              to_char(c.created_at, 'YYYY-MM-DD') AS "createdAt"
         FROM review_cycles c
         ${filter}
        ORDER BY c.created_at DESC`,
      params,
    )) as CycleView[];
  }
}
