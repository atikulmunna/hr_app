import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { EmployeeSkill } from '../../entities/employee-skill.entity';
import { RoleSkill } from '../../entities/role-skill.entity';
import { Skill } from '../../entities/skill.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';

// The proficiency ladder every skill is rated on. Fixed for now; a tenant-defined
// scale can follow the rating_scales pattern from performance if a need appears.
export const PROFICIENCY_LEVELS: { value: number; label: string }[] = [
  { value: 1, label: 'Awareness' },
  { value: 2, label: 'Basic' },
  { value: 3, label: 'Intermediate' },
  { value: 4, label: 'Advanced' },
  { value: 5, label: 'Expert' },
];

const MIN_LEVEL = 1;
const MAX_LEVEL = 5;

export interface CreateSkillInput {
  name?: string;
  category?: string;
  description?: string;
}

export interface SkillView {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
}

export interface RoleSkillView {
  id: string;
  role: string;
  skillId: string;
  skillName: string;
  category: string | null;
  requiredLevel: number;
}

export interface EmployeeSkillView {
  id: string;
  employeeId: string;
  skillId: string;
  skillName: string;
  category: string | null;
  level: number;
  assessedOn: string | null;
  note: string | null;
}

export interface MatrixColumn {
  skillId: string;
  name: string;
  category: string | null;
  requiredLevel: number | null;
}

export interface MatrixCell {
  skillId: string;
  level: number | null;
  meetsRequirement: boolean;
}

export interface MatrixView {
  role: string;
  levels: { value: number; label: string }[];
  columns: MatrixColumn[];
  rows: {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    cells: MatrixCell[];
  }[];
}

// Skill catalog, per-role requirements, and the employee skill matrix (T-3.3,
// FR-M7-03). A "role" is the employee job title, as there is no positions table.
@Injectable()
export class SkillService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  levels() {
    return PROFICIENCY_LEVELS;
  }

  // --- Skill catalog.

  listSkills(): Promise<SkillView[]> {
    return this.db.withTenant(
      (m) =>
        m.query(
          `SELECT id, name, category, description
             FROM skills ORDER BY category NULLS FIRST, name ASC`,
        ) as Promise<SkillView[]>,
    );
  }

  async createSkill(
    user: AuthUser,
    input: CreateSkillInput,
  ): Promise<SkillView> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('A skill needs a name.');
    }
    const category = input.category?.trim() || null;
    const description = input.description?.trim() || null;
    return this.db.withTenant(async (m) => {
      const duplicate = await m.query(
        `SELECT 1 FROM skills WHERE lower(name) = lower($1)`,
        [name],
      );
      if (duplicate.length) {
        throw new BadRequestException(
          `A skill named "${name}" already exists.`,
        );
      }
      const skill = await m.save(
        m.create(Skill, {
          tenantId: this.db.tenantId,
          name,
          category: category ?? undefined,
          description: description ?? undefined,
        }),
      );
      await this.audit.record(
        {
          action: 'skill.create',
          resourceType: 'skill',
          resourceId: skill.id,
          after: { name },
        },
        m,
      );
      return { id: skill.id, name, category, description };
    });
  }

  // --- Roles and their required skills.

  roles(): Promise<string[]> {
    return this.db.withTenant(async (m) => {
      const rows = (await m.query(
        `SELECT DISTINCT job_title AS role FROM employees
          WHERE job_title IS NOT NULL AND job_title <> '' AND status <> 'terminated'
          ORDER BY job_title ASC`,
      )) as { role: string }[];
      return rows.map((r) => r.role);
    });
  }

  listRoleSkills(role: string): Promise<RoleSkillView[]> {
    return this.db.withTenant(
      (m) =>
        m.query(
          `SELECT rs.id, rs.role, rs.skill_id AS "skillId", s.name AS "skillName",
                  s.category, rs.required_level AS "requiredLevel"
             FROM role_skills rs JOIN skills s ON s.id = rs.skill_id
            WHERE lower(rs.role) = lower($1)
            ORDER BY s.category NULLS FIRST, s.name ASC`,
          [role],
        ) as Promise<RoleSkillView[]>,
    );
  }

  async setRoleSkill(
    role: string,
    skillId: string,
    requiredLevel: number,
  ): Promise<RoleSkillView[]> {
    const trimmed = role?.trim();
    if (!trimmed) {
      throw new BadRequestException('A role is required.');
    }
    this.assertLevel(requiredLevel);
    await this.db.withTenant(async (m) => {
      await this.skillOrThrow(m, skillId);
      const existing = await m.findOne(RoleSkill, {
        where: { role: trimmed, skillId },
      });
      if (existing) {
        existing.requiredLevel = requiredLevel;
        await m.save(existing);
      } else {
        await m.save(
          m.create(RoleSkill, {
            tenantId: this.db.tenantId,
            role: trimmed,
            skillId,
            requiredLevel,
          }),
        );
      }
    });
    return this.listRoleSkills(trimmed);
  }

  async removeRoleSkill(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      await m.delete(RoleSkill, { id });
    });
  }

  // --- Employee proficiencies.

  listEmployeeSkills(employeeId: string): Promise<EmployeeSkillView[]> {
    return this.db.withTenant(
      (m) =>
        m.query(
          `SELECT es.id, es.employee_id AS "employeeId", es.skill_id AS "skillId",
                  s.name AS "skillName", s.category, es.level,
                  to_char(es.assessed_on, 'YYYY-MM-DD') AS "assessedOn", es.note
             FROM employee_skills es JOIN skills s ON s.id = es.skill_id
            WHERE es.employee_id = $1
            ORDER BY s.category NULLS FIRST, s.name ASC`,
          [employeeId],
        ) as Promise<EmployeeSkillView[]>,
    );
  }

  async setEmployeeSkill(input: {
    employeeId?: string;
    skillId?: string;
    level?: number;
    assessedOn?: string | null;
    note?: string | null;
  }): Promise<EmployeeSkillView[]> {
    if (!input.employeeId || !input.skillId) {
      throw new BadRequestException('An employee and skill are required.');
    }
    this.assertLevel(input.level);
    await this.db.withTenant(async (m) => {
      await this.skillOrThrow(m, input.skillId as string);
      const existing = await m.findOne(EmployeeSkill, {
        where: { employeeId: input.employeeId, skillId: input.skillId },
      });
      if (existing) {
        existing.level = input.level as number;
        existing.assessedOn = input.assessedOn ?? null;
        existing.note = input.note?.trim() || undefined;
        await m.save(existing);
      } else {
        await m.save(
          m.create(EmployeeSkill, {
            tenantId: this.db.tenantId,
            employeeId: input.employeeId,
            skillId: input.skillId,
            level: input.level as number,
            assessedOn: input.assessedOn ?? null,
            note: input.note?.trim() || undefined,
          }),
        );
      }
    });
    return this.listEmployeeSkills(input.employeeId);
  }

  async removeEmployeeSkill(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      await m.delete(EmployeeSkill, { id });
    });
  }

  // --- The matrix: columns are the role's skills (required or merely held),
  // rows are the employees in that role, cells are level vs requirement.
  matrix(role: string): Promise<MatrixView> {
    return this.db.withTenant(async (m) => {
      const required = (await m.query(
        `SELECT rs.skill_id AS "skillId", s.name, s.category,
                rs.required_level AS "requiredLevel"
           FROM role_skills rs JOIN skills s ON s.id = rs.skill_id
          WHERE lower(rs.role) = lower($1)`,
        [role],
      )) as {
        skillId: string;
        name: string;
        category: string | null;
        requiredLevel: number;
      }[];

      const employees = (await m.query(
        `SELECT id AS "employeeId",
                first_name || ' ' || last_name AS "employeeName",
                employee_code AS "employeeCode"
           FROM employees
          WHERE lower(job_title) = lower($1) AND status <> 'terminated'
          ORDER BY employee_code ASC`,
        [role],
      )) as {
        employeeId: string;
        employeeName: string;
        employeeCode: string;
      }[];

      const held = (await m.query(
        `SELECT es.employee_id AS "employeeId", es.skill_id AS "skillId",
                s.name, s.category, es.level
           FROM employee_skills es
           JOIN skills s ON s.id = es.skill_id
           JOIN employees e ON e.id = es.employee_id
          WHERE lower(e.job_title) = lower($1) AND e.status <> 'terminated'`,
        [role],
      )) as {
        employeeId: string;
        skillId: string;
        name: string;
        category: string | null;
        level: number;
      }[];

      // Columns: required skills first, then any extra skills these employees
      // hold, de-duplicated by skill id.
      const columns = new Map<string, MatrixColumn>();
      for (const r of required) {
        columns.set(r.skillId, {
          skillId: r.skillId,
          name: r.name,
          category: r.category,
          requiredLevel: r.requiredLevel,
        });
      }
      for (const h of held) {
        if (!columns.has(h.skillId)) {
          columns.set(h.skillId, {
            skillId: h.skillId,
            name: h.name,
            category: h.category,
            requiredLevel: null,
          });
        }
      }
      const columnList = Array.from(columns.values()).sort(
        (a, b) =>
          (a.category ?? '').localeCompare(b.category ?? '') ||
          a.name.localeCompare(b.name),
      );

      const levelOf = new Map<string, number>();
      for (const h of held) {
        levelOf.set(`${h.employeeId}:${h.skillId}`, h.level);
      }

      const rows = employees.map((e) => ({
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        employeeCode: e.employeeCode,
        cells: columnList.map((col): MatrixCell => {
          const level = levelOf.get(`${e.employeeId}:${col.skillId}`) ?? null;
          const meetsRequirement =
            col.requiredLevel == null
              ? true
              : level != null && level >= col.requiredLevel;
          return { skillId: col.skillId, level, meetsRequirement };
        }),
      }));

      return { role, levels: PROFICIENCY_LEVELS, columns: columnList, rows };
    });
  }

  // --- Internals.

  private assertLevel(level: number | undefined): void {
    if (
      typeof level !== 'number' ||
      !Number.isInteger(level) ||
      level < MIN_LEVEL ||
      level > MAX_LEVEL
    ) {
      throw new BadRequestException(
        `A level must be an integer from ${MIN_LEVEL} to ${MAX_LEVEL}.`,
      );
    }
  }

  private async skillOrThrow(m: EntityManager, skillId: string): Promise<void> {
    const skill = await m.findOne(Skill, { where: { id: skillId } });
    if (!skill) {
      throw new BadRequestException('Unknown skill.');
    }
  }
}
