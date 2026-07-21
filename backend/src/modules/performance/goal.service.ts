import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Goal, GoalStatus } from '../../entities/goal.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';

const GOAL_STATUSES: GoalStatus[] = ['active', 'achieved', 'missed', 'cancelled'];

export interface CreateGoalInput {
  employeeId?: string;
  cycleId?: string | null;
  parentGoalId?: string | null;
  title?: string;
  description?: string;
  weight?: number | null;
}

export interface GoalView {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId: string | null;
  parentGoalId: string | null;
  parentTitle: string | null;
  title: string;
  description: string | null;
  weight: number | null;
  progress: number;
  status: string;
  createdAt: string;
}

// Goals and OKRs (T-3.2, FR-M6-01). HR or a manager sets goals for an employee;
// a goal can cascade from a parent goal and tracks a 0..100 progress. The
// employee updates progress on their own goals.
@Injectable()
export class GoalService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
  ) {}

  listForEmployee(employeeId: string): Promise<GoalView[]> {
    return this.db.withTenant((m) => this.views(m, { employeeId }));
  }

  async mine(user: AuthUser): Promise<GoalView[]> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant((m) => this.views(m, { employeeId: me.id }));
  }

  async create(user: AuthUser, input: CreateGoalInput): Promise<GoalView> {
    const title = input.title?.trim();
    if (!input.employeeId) {
      throw new BadRequestException('A goal needs an employee.');
    }
    if (!title) {
      throw new BadRequestException('A goal needs a title.');
    }
    if (input.weight != null && (Number.isNaN(input.weight) || input.weight < 0)) {
      throw new BadRequestException('Weight must be zero or more.');
    }
    const id = await this.db.withTenant(async (m) => {
      if (input.parentGoalId) {
        const parent = await m.findOne(Goal, { where: { id: input.parentGoalId } });
        if (!parent) {
          throw new BadRequestException('Unknown parent goal.');
        }
      }
      const goal = await m.save(
        m.create(Goal, {
          tenantId: this.db.tenantId,
          employeeId: input.employeeId,
          cycleId: input.cycleId ?? null,
          parentGoalId: input.parentGoalId ?? null,
          title,
          description: input.description?.trim() || null,
          weight: input.weight != null ? input.weight.toFixed(2) : null,
          progress: 0,
          status: 'active',
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'goal.create',
          resourceType: 'goal',
          resourceId: goal.id,
          after: { employeeId: input.employeeId, title },
        },
        m,
      );
      return goal.id;
    });
    return this.getOne(id);
  }

  // HR or manager updates progress/status for any goal.
  update(
    id: string,
    input: { progress?: number; status?: GoalStatus },
  ): Promise<GoalView> {
    return this.applyUpdate(id, input);
  }

  // The employee updates progress on their own goal only.
  async updateMine(
    user: AuthUser,
    id: string,
    input: { progress?: number; status?: GoalStatus },
  ): Promise<GoalView> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.applyUpdate(id, input, me.id);
  }

  private async applyUpdate(
    id: string,
    input: { progress?: number; status?: GoalStatus },
    ownerEmployeeId?: string,
  ): Promise<GoalView> {
    if (input.progress !== undefined) {
      if (
        !Number.isInteger(input.progress) ||
        input.progress < 0 ||
        input.progress > 100
      ) {
        throw new BadRequestException('Progress must be a whole number from 0 to 100.');
      }
    }
    if (input.status !== undefined && !GOAL_STATUSES.includes(input.status)) {
      throw new BadRequestException('Unknown goal status.');
    }
    await this.db.withTenant(async (m) => {
      const goal = await m.findOne(Goal, { where: { id } });
      if (!goal || (ownerEmployeeId && goal.employeeId !== ownerEmployeeId)) {
        throw new NotFoundException('Goal not found.');
      }
      if (input.progress !== undefined) {
        goal.progress = input.progress;
        // Reaching 100 marks it achieved unless it was explicitly closed.
        if (input.progress === 100 && goal.status === 'active') {
          goal.status = 'achieved';
        }
      }
      if (input.status !== undefined) {
        goal.status = input.status;
      }
      await m.save(goal);
      await this.audit.record(
        {
          action: 'goal.update',
          resourceType: 'goal',
          resourceId: id,
          after: { progress: goal.progress, status: goal.status },
        },
        m,
      );
    });
    return this.getOne(id);
  }

  private async getOne(id: string): Promise<GoalView> {
    return this.db.withTenant(async (m) => {
      const [goal] = await this.views(m, { id });
      if (!goal) {
        throw new NotFoundException('Goal not found.');
      }
      return goal;
    });
  }

  private async views(
    m: EntityManager,
    where: { id?: string; employeeId?: string },
  ): Promise<GoalView[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (where.id) {
      params.push(where.id);
      clauses.push(`g.id = $${params.length}`);
    }
    if (where.employeeId) {
      params.push(where.employeeId);
      clauses.push(`g.employee_id = $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return (await m.query(
      `SELECT g.id,
              g.employee_id AS "employeeId",
              e.first_name || ' ' || e.last_name AS "employeeName",
              g.cycle_id AS "cycleId",
              g.parent_goal_id AS "parentGoalId",
              parent.title AS "parentTitle",
              g.title,
              g.description,
              g.weight::float AS weight,
              g.progress,
              g.status,
              to_char(g.created_at, 'YYYY-MM-DD') AS "createdAt"
         FROM goals g
         JOIN employees e ON e.id = g.employee_id
         LEFT JOIN goals parent ON parent.id = g.parent_goal_id
         ${filter}
        ORDER BY g.created_at DESC`,
      params,
    )) as GoalView[];
  }
}
