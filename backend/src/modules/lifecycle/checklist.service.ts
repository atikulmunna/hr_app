import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { ChecklistItem } from '../../entities/checklist-item.entity';
import {
  ChecklistKind,
  ChecklistTemplateItem,
} from '../../entities/checklist-template-item.entity';
import { Checklist } from '../../entities/checklist.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { hasPermission } from '../auth/permissions';
import { NotificationService } from '../notifications/notification.service';

export const CHECKLIST_KINDS: ChecklistKind[] = ['onboarding', 'offboarding'];

// The parties a task can be assigned to. Each maps to how the task is scoped:
// the employee sees their own, a manager sees their reports', HR sees all.
export const TASK_ROLES = ['employee', 'manager', 'hr_admin'] as const;

export interface TemplateItemInput {
  title?: string;
  assigneeRole?: string;
  dueOffsetDays?: number;
}

export interface TemplateItem {
  title: string;
  assigneeRole: string;
  dueOffsetDays: number;
}

// Sensible starting templates, seeded for a tenant that has none. Offsets count
// from the hire date or the termination date.
const DEFAULT_TEMPLATES: Record<ChecklistKind, TemplateItem[]> = {
  onboarding: [
    { title: 'Sign the employment contract', assigneeRole: 'employee', dueOffsetDays: 0 },
    { title: 'Collect ID, tax, and bank details', assigneeRole: 'hr_admin', dueOffsetDays: 0 },
    { title: 'Assign shift, geofence, and leave policy', assigneeRole: 'hr_admin', dueOffsetDays: 1 },
    { title: 'Set up workstation and system accounts', assigneeRole: 'manager', dueOffsetDays: 1 },
    { title: 'Welcome and team introductions', assigneeRole: 'manager', dueOffsetDays: 2 },
    { title: 'Acknowledge company policies', assigneeRole: 'employee', dueOffsetDays: 5 },
    { title: '30-day check-in', assigneeRole: 'manager', dueOffsetDays: 30 },
  ],
  offboarding: [
    { title: 'Hand over responsibilities and documents', assigneeRole: 'employee', dueOffsetDays: -5 },
    { title: 'Return company equipment and access cards', assigneeRole: 'employee', dueOffsetDays: 0 },
    { title: 'Confirm handover is complete', assigneeRole: 'manager', dueOffsetDays: 0 },
    { title: 'Revoke system and building access', assigneeRole: 'hr_admin', dueOffsetDays: 0 },
    { title: 'Exit interview', assigneeRole: 'hr_admin', dueOffsetDays: 0 },
    { title: 'Final settlement and last payslip', assigneeRole: 'hr_admin', dueOffsetDays: 7 },
  ],
};

export interface ChecklistSummary {
  id: string;
  kind: ChecklistKind;
  status: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  anchorDate: string;
  openedAt: string;
  completedAt: string | null;
  total: number;
  done: number;
  overdue: number;
}

export interface ChecklistView extends ChecklistSummary {
  items: ChecklistItem[];
}

// A pending task as the person who owes it sees it.
export interface TaskView {
  id: string;
  checklistId: string;
  kind: ChecklistKind;
  title: string;
  assigneeRole: string;
  dueOn: string | null;
  employeeId: string;
  employeeName: string;
}

export function assertKind(kind: unknown): ChecklistKind {
  if (kind !== 'onboarding' && kind !== 'offboarding') {
    throw new BadRequestException('kind must be onboarding or offboarding.');
  }
  return kind;
}

// Normalizes a template before it is saved: every row needs a title and a
// known role, and the offset is an integer number of days.
export function validateTemplateItems(items: unknown): TemplateItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestException('A template needs at least one item.');
  }
  return items.map((raw: TemplateItemInput, index) => {
    const title = raw?.title?.trim();
    if (!title) {
      throw new BadRequestException(`Item ${index + 1} needs a title.`);
    }
    const role = raw.assigneeRole?.trim();
    if (!role || !(TASK_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(
        `Item ${index + 1}: assigneeRole must be one of ${TASK_ROLES.join(', ')}.`,
      );
    }
    const offset = raw.dueOffsetDays ?? 0;
    if (!Number.isInteger(offset) || Math.abs(offset) > 365) {
      throw new BadRequestException(
        `Item ${index + 1}: dueOffsetDays must be a whole number of days within a year.`,
      );
    }
    return { title, assigneeRole: role, dueOffsetDays: offset };
  });
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Onboarding and offboarding checklists (T-3.4b, FR-M1-10).
@Injectable()
export class ChecklistService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // --- Templates.

  templates(): Promise<Record<ChecklistKind, ChecklistTemplateItem[]>> {
    return this.db.withTenant(async (m) => {
      const out = {} as Record<ChecklistKind, ChecklistTemplateItem[]>;
      for (const kind of CHECKLIST_KINDS) {
        out[kind] = await this.templateFor(m, kind);
      }
      return out;
    });
  }

  replaceTemplate(kind: ChecklistKind, items: unknown): Promise<ChecklistTemplateItem[]> {
    const valid = validateTemplateItems(items);
    return this.db.withTenant(async (m) => {
      await m.delete(ChecklistTemplateItem, { kind });
      await this.insertTemplate(m, kind, valid);
      await this.audit.record(
        {
          action: 'checklist.template_update',
          resourceType: 'checklist_template',
          resourceId: kind,
          after: { items: valid.length },
        },
        m,
      );
      return this.templateFor(m, kind);
    });
  }

  // --- Opening.

  // Opens a checklist inside the caller's transaction; the employee lifecycle
  // hooks (hire, termination) call this. Idempotent: an open checklist of the
  // same kind is returned as is.
  async open(
    m: EntityManager,
    employeeId: string,
    kind: ChecklistKind,
    anchorDate: string,
    openedBySub: string | undefined,
  ): Promise<Checklist> {
    const existing = await m.findOne(Checklist, {
      where: { employeeId, kind, status: 'open' },
    });
    if (existing) {
      return existing;
    }
    const template = await this.templateFor(m, kind);
    const checklist = await m.save(
      m.create(Checklist, {
        tenantId: this.db.tenantId,
        employeeId,
        kind,
        status: 'open',
        anchorDate,
        openedBySub: openedBySub ?? null,
      }),
    );
    for (const t of template) {
      await m.save(
        m.create(ChecklistItem, {
          tenantId: this.db.tenantId,
          checklistId: checklist.id,
          title: t.title,
          assigneeRole: t.assigneeRole,
          dueOn: addDays(anchorDate, t.dueOffsetDays),
          sortOrder: t.sortOrder,
          status: 'pending',
        }),
      );
    }
    await this.audit.record(
      {
        action: 'checklist.open',
        resourceType: 'checklist',
        resourceId: checklist.id,
        after: { employeeId, kind, anchorDate, items: template.length },
      },
      m,
    );
    await this.notifyOpened(m, checklist, template);
    return checklist;
  }

  // HR opens one by hand, for an employee hired before this feature existed or
  // to re-run a checklist. The anchor defaults to today.
  openManually(
    input: { employeeId?: string; kind?: unknown; anchorDate?: string },
    user: AuthUser,
  ): Promise<ChecklistView> {
    const kind = assertKind(input.kind);
    if (!input.employeeId) {
      throw new BadRequestException('employeeId is required.');
    }
    const anchor = input.anchorDate ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(Date.parse(anchor))) {
      throw new BadRequestException('anchorDate must be a YYYY-MM-DD date.');
    }
    return this.db.withTenant(async (m) => {
      const [employee] = (await m.query(
        `SELECT id FROM employees WHERE id = $1 AND erased_at IS NULL`,
        [input.employeeId],
      )) as { id: string }[];
      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }
      const checklist = await this.open(m, employee.id, kind, anchor, user.sub);
      return this.view(m, checklist.id);
    });
  }

  // --- Reading.

  list(status?: string): Promise<ChecklistSummary[]> {
    if (status && status !== 'open' && status !== 'complete') {
      throw new BadRequestException('status must be open or complete.');
    }
    return this.db.withTenant((m) => this.summaries(m, { status }));
  }

  get(id: string): Promise<ChecklistView> {
    return this.db.withTenant((m) => this.view(m, id));
  }

  // The pending tasks the caller owes across every open checklist, scoped by
  // role: their own employee tasks, their reports' manager tasks, and every HR
  // task when they hold hr_admin.
  myTasks(user: AuthUser): Promise<TaskView[]> {
    return this.db.withTenant(async (m) => {
      const me = await this.resolveEmployeeId(m, user);
      const isHr = user.roles.includes('hr_admin');
      return this.taskRows(m, me, isHr);
    });
  }

  // --- Completing.

  completeItem(user: AuthUser, itemId: string, note?: string): Promise<ChecklistView> {
    return this.db.withTenant(async (m) => {
      const item = await m.findOne(ChecklistItem, { where: { id: itemId } });
      if (!item) {
        throw new NotFoundException('Task not found.');
      }
      const checklist = await m.findOne(Checklist, { where: { id: item.checklistId } });
      if (!checklist || checklist.status !== 'open') {
        throw new BadRequestException('This checklist is already complete.');
      }
      if (item.status === 'done') {
        throw new BadRequestException('This task is already done.');
      }
      await this.assertMayComplete(m, user, item, checklist);

      item.status = 'done';
      item.completedBySub = user.sub ?? null;
      item.completedAt = new Date();
      item.note = note?.trim() || null;
      await m.save(item);
      await this.audit.record(
        {
          action: 'checklist.item_complete',
          resourceType: 'checklist_item',
          resourceId: item.id,
          after: { checklistId: checklist.id, title: item.title, note: item.note },
        },
        m,
      );

      const remaining = await m.count(ChecklistItem, {
        where: { checklistId: checklist.id, status: 'pending' },
      });
      if (remaining === 0) {
        checklist.status = 'complete';
        checklist.completedAt = new Date();
        await m.save(checklist);
        await this.audit.record(
          {
            action: 'checklist.complete',
            resourceType: 'checklist',
            resourceId: checklist.id,
            after: { kind: checklist.kind, employeeId: checklist.employeeId },
          },
          m,
        );
        await this.notifications.notify(
          {
            recipientRole: 'hr_admin',
            type: 'checklist.complete',
            title: `${capitalize(checklist.kind)} complete`,
            body: `Every ${checklist.kind} task for ${await this.employeeName(m, checklist.employeeId)} is done.`,
            data: { checklistId: checklist.id, kind: checklist.kind },
          },
          m,
        );
      }
      return this.view(m, checklist.id);
    });
  }

  // HR may complete anything. Otherwise the task must be owed by one of the
  // caller's roles and concern them: a manager only for their own reports, an
  // employee only for their own checklist.
  private async assertMayComplete(
    m: EntityManager,
    user: AuthUser,
    item: ChecklistItem,
    checklist: Checklist,
  ): Promise<void> {
    if (hasPermission(user.permissions, 'employee:manage')) {
      return;
    }
    const me = await this.resolveEmployeeId(m, user);
    if (item.assigneeRole === 'employee' && me && checklist.employeeId === me) {
      return;
    }
    if (item.assigneeRole === 'manager' && me && user.roles.includes('manager')) {
      const [row] = (await m.query(
        `SELECT 1 FROM employees WHERE id = $1 AND manager_id = $2`,
        [checklist.employeeId, me],
      )) as unknown[];
      if (row) {
        return;
      }
    }
    throw new ForbiddenException('This task is not assigned to you.');
  }

  // --- Internals.

  private async templateFor(
    m: EntityManager,
    kind: ChecklistKind,
  ): Promise<ChecklistTemplateItem[]> {
    const rows = await m.find(ChecklistTemplateItem, {
      where: { kind },
      order: { sortOrder: 'ASC' },
    });
    if (rows.length > 0) {
      return rows;
    }
    await this.insertTemplate(m, kind, DEFAULT_TEMPLATES[kind]);
    return m.find(ChecklistTemplateItem, { where: { kind }, order: { sortOrder: 'ASC' } });
  }

  private async insertTemplate(
    m: EntityManager,
    kind: ChecklistKind,
    items: TemplateItem[],
  ): Promise<void> {
    let order = 1;
    for (const item of items) {
      await m.save(
        m.create(ChecklistTemplateItem, {
          tenantId: this.db.tenantId,
          kind,
          title: item.title,
          assigneeRole: item.assigneeRole,
          dueOffsetDays: item.dueOffsetDays,
          sortOrder: order,
        }),
      );
      order += 1;
    }
  }

  private async summaries(
    m: EntityManager,
    where: { id?: string; status?: string },
  ): Promise<ChecklistSummary[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (where.id) {
      params.push(where.id);
      clauses.push(`c.id = $${params.length}`);
    }
    if (where.status) {
      params.push(where.status);
      clauses.push(`c.status = $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return (await m.query(
      `SELECT c.id, c.kind, c.status,
              c.employee_id AS "employeeId",
              e.employee_code AS "employeeCode",
              e.first_name || ' ' || e.last_name AS "employeeName",
              to_char(c.anchor_date, 'YYYY-MM-DD') AS "anchorDate",
              c.opened_at AS "openedAt",
              c.completed_at AS "completedAt",
              (SELECT count(*)::int FROM checklist_items i WHERE i.checklist_id = c.id) AS total,
              (SELECT count(*)::int FROM checklist_items i
                WHERE i.checklist_id = c.id AND i.status = 'done') AS done,
              (SELECT count(*)::int FROM checklist_items i
                WHERE i.checklist_id = c.id AND i.status = 'pending'
                  AND i.due_on < current_date) AS overdue
         FROM checklists c
         JOIN employees e ON e.id = c.employee_id
         ${filter}
        ORDER BY (c.status = 'open') DESC, c.opened_at DESC`,
      params,
    )) as ChecklistSummary[];
  }

  private async view(m: EntityManager, id: string): Promise<ChecklistView> {
    const [summary] = await this.summaries(m, { id });
    if (!summary) {
      throw new NotFoundException('Checklist not found.');
    }
    const items = (await m.query(
      `SELECT id, checklist_id AS "checklistId", title,
              assignee_role AS "assigneeRole",
              to_char(due_on, 'YYYY-MM-DD') AS "dueOn",
              sort_order AS "sortOrder", status, note,
              completed_by_sub AS "completedBySub", completed_at AS "completedAt"
         FROM checklist_items
        WHERE checklist_id = $1
        ORDER BY sort_order`,
      [id],
    )) as ChecklistItem[];
    return { ...summary, items };
  }

  private async taskRows(
    m: EntityManager,
    me: string | null,
    isHr: boolean,
  ): Promise<TaskView[]> {
    return (await m.query(
      `SELECT i.id, i.checklist_id AS "checklistId", c.kind, i.title,
              i.assignee_role AS "assigneeRole",
              to_char(i.due_on, 'YYYY-MM-DD') AS "dueOn",
              c.employee_id AS "employeeId",
              e.first_name || ' ' || e.last_name AS "employeeName"
         FROM checklist_items i
         JOIN checklists c ON c.id = i.checklist_id
         JOIN employees e ON e.id = c.employee_id
        WHERE i.status = 'pending' AND c.status = 'open'
          AND (
            (i.assignee_role = 'hr_admin' AND $2)
            OR (i.assignee_role = 'employee' AND c.employee_id = $1)
            OR (i.assignee_role = 'manager' AND e.manager_id = $1)
          )
        ORDER BY i.due_on NULLS LAST, c.opened_at, i.sort_order`,
      [me, isHr],
    )) as TaskView[];
  }

  private async resolveEmployeeId(m: EntityManager, user: AuthUser): Promise<string | null> {
    const rows = (await m.query(
      `SELECT id FROM employees
        WHERE keycloak_sub = $1 OR (email = $2 AND $2 <> '')
        LIMIT 1`,
      [user.sub ?? '', user.email ?? ''],
    )) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  private async employeeName(m: EntityManager, employeeId: string): Promise<string> {
    const [row] = (await m.query(
      `SELECT first_name || ' ' || last_name AS name FROM employees WHERE id = $1`,
      [employeeId],
    )) as { name: string }[];
    return row?.name ?? 'the employee';
  }

  // Tells each party that has tasks on a new checklist: HR by role, the
  // employee and their manager by their linked accounts when known.
  private async notifyOpened(
    m: EntityManager,
    checklist: Checklist,
    template: ChecklistTemplateItem[],
  ): Promise<void> {
    const roles = new Set(template.map((t) => t.assigneeRole));
    const [row] = (await m.query(
      `SELECT e.first_name || ' ' || e.last_name AS name,
              e.keycloak_sub AS "employeeSub",
              mgr.keycloak_sub AS "managerSub"
         FROM employees e
         LEFT JOIN employees mgr ON mgr.id = e.manager_id
        WHERE e.id = $1`,
      [checklist.employeeId],
    )) as { name: string; employeeSub: string | null; managerSub: string | null }[];
    const title = `${capitalize(checklist.kind)} started`;
    const data = { checklistId: checklist.id, kind: checklist.kind };
    if (roles.has('hr_admin')) {
      await this.notifications.notify(
        {
          recipientRole: 'hr_admin',
          type: 'checklist.open',
          title,
          body: `${row?.name ?? 'An employee'} has ${checklist.kind} tasks waiting for HR.`,
          data,
        },
        m,
      );
    }
    if (roles.has('employee') && row?.employeeSub) {
      await this.notifications.notify(
        {
          recipientSub: row.employeeSub,
          type: 'checklist.open',
          title,
          body: `You have ${checklist.kind} tasks to complete.`,
          data,
        },
        m,
      );
    }
    if (roles.has('manager') && row?.managerSub) {
      await this.notifications.notify(
        {
          recipientSub: row.managerSub,
          type: 'checklist.open',
          title,
          body: `${row.name} has ${checklist.kind} tasks waiting for you as their manager.`,
          data,
        },
        m,
      );
    }
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
