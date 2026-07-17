import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { StatutoryBracket } from '../../entities/statutory-bracket.entity';
import {
  StatutoryBase,
  StatutoryCalculation,
  StatutoryRule,
} from '../../entities/statutory-rule.entity';
import { AuditService } from '../audit/audit.service';

export interface BracketInput {
  lowerBound?: number;
  upperBound?: number | null;
  rate?: number;
}

export interface CreateStatutoryRuleInput {
  legalEntityId?: string;
  code?: string;
  name?: string;
  calculation?: StatutoryCalculation;
  base?: StatutoryBase;
  employeeRate?: number;
  employerRate?: number;
  wageCeiling?: number | null;
  effectiveFrom?: string;
  brackets?: BracketInput[];
}

export interface StatutoryRuleView extends StatutoryRule {
  brackets: { lowerBound: number; upperBound: number | null; rate: number }[];
}

// What one rule takes from one employee.
export interface StatutoryCharge {
  code: string;
  name: string;
  base: number;
  employee: number;
  employer: number;
}

const CALCULATIONS: StatutoryCalculation[] = ['percentage', 'bracket'];
const BASES: StatutoryBase[] = ['basic', 'gross'];

// Statutory deductions per jurisdiction (T-2.3, FR-M4-06). Rules are law, so
// they are configurable data per legal entity and effective-dated: a run
// resolves what was in force at its cut-off rather than what is current.
@Injectable()
export class StatutoryService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(legalEntityId?: string): Promise<StatutoryRuleView[]> {
    return this.db.withTenant(async (m) => {
      const rules = await m.find(StatutoryRule, {
        where: legalEntityId ? { legalEntityId } : {},
        order: { code: 'ASC', effectiveFrom: 'DESC' },
      });
      return this.withBrackets(m, rules);
    });
  }

  // The rules in force on a date: the latest revision of each code on or before
  // it, skipping inactive ones.
  //
  // Loaded through the entity mapper rather than raw SQL: a `SELECT *` returns
  // snake_case columns and a Date for effective_from, so the rates would read
  // back undefined and every charge would silently compute to nothing.
  async inForce(
    legalEntityId: string,
    on: string,
  ): Promise<StatutoryRuleView[]> {
    return this.db.withTenant(async (m) => {
      const rules = await m.find(StatutoryRule, {
        where: { legalEntityId },
        order: { code: 'ASC', effectiveFrom: 'DESC' },
      });
      const latest = new Map<string, StatutoryRule>();
      for (const rule of rules) {
        // Ordered newest first, so the first hit for a code is the one in force.
        if (rule.effectiveFrom <= on && !latest.has(rule.code)) {
          latest.set(rule.code, rule);
        }
      }
      return this.withBrackets(
        m,
        [...latest.values()].filter((r) => r.active),
      );
    });
  }

  async create(input: CreateStatutoryRuleInput): Promise<StatutoryRuleView> {
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException('A statutory rule needs a code and a name.');
    }
    if (!input.legalEntityId) {
      throw new BadRequestException('legalEntityId is required.');
    }
    if (!input.calculation || !CALCULATIONS.includes(input.calculation)) {
      throw new BadRequestException(
        `calculation must be one of: ${CALCULATIONS.join(', ')}.`,
      );
    }
    const base = input.base ?? 'gross';
    if (!BASES.includes(base)) {
      throw new BadRequestException(`base must be one of: ${BASES.join(', ')}.`);
    }
    const effectiveFrom = requireDate(input.effectiveFrom, 'effectiveFrom');
    const employeeRate = rate(input.employeeRate ?? 0, 'employeeRate');
    const employerRate = rate(input.employerRate ?? 0, 'employerRate');

    if (input.wageCeiling != null && input.wageCeiling <= 0) {
      throw new BadRequestException('wageCeiling must be greater than 0.');
    }
    const brackets =
      input.calculation === 'bracket' ? validateBrackets(input.brackets) : [];

    const id = await this.db.withTenant(async (m) => {
      const entity = await m.findOne(LegalEntity, {
        where: { id: input.legalEntityId },
      });
      if (!entity) {
        throw new BadRequestException('Unknown legal entity.');
      }
      const clash = await m.findOne(StatutoryRule, {
        where: { legalEntityId: entity.id, code, effectiveFrom },
      });
      if (clash) {
        throw new BadRequestException(
          `${entity.name} already has a "${code}" rule effective ${effectiveFrom}. Use a different date to supersede it.`,
        );
      }

      const rule = await m.save(
        m.create(StatutoryRule, {
          tenantId: this.db.tenantId,
          legalEntityId: entity.id,
          code,
          name,
          calculation: input.calculation!,
          base,
          employeeRate: employeeRate.toFixed(3),
          employerRate: employerRate.toFixed(3),
          wageCeiling: input.wageCeiling?.toFixed(2) ?? null,
          effectiveFrom,
          active: true,
        }),
      );
      if (brackets.length > 0) {
        await m.save(
          brackets.map((b) =>
            m.create(StatutoryBracket, {
              tenantId: this.db.tenantId,
              ruleId: rule.id,
              lowerBound: b.lowerBound.toFixed(2),
              upperBound: b.upperBound?.toFixed(2) ?? null,
              rate: b.rate.toFixed(3),
            }),
          ),
        );
      }
      await this.audit.record(
        {
          action: 'statutory_rule.create',
          resourceType: 'statutory_rule',
          resourceId: rule.id,
          after: { code, name, calculation: input.calculation, effectiveFrom },
        },
        m,
      );
      return rule.id;
    });

    const [created] = await this.db.withTenant(async (m) => {
      const rule = await m.findOne(StatutoryRule, { where: { id } });
      return this.withBrackets(m, rule ? [rule] : []);
    });
    return created;
  }

  async setActive(id: string, active: boolean): Promise<StatutoryRule> {
    return this.db.withTenant(async (m) => {
      const rule = await m.findOne(StatutoryRule, { where: { id } });
      if (!rule) {
        throw new NotFoundException('Statutory rule not found.');
      }
      rule.active = active;
      await m.save(rule);
      await this.audit.record(
        {
          action: 'statutory_rule.update',
          resourceType: 'statutory_rule',
          resourceId: id,
          after: { active },
        },
        m,
      );
      return rule;
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const result = await m.delete(StatutoryRule, { id });
      if (!result.affected) {
        throw new NotFoundException('Statutory rule not found.');
      }
      await this.audit.record(
        {
          action: 'statutory_rule.delete',
          resourceType: 'statutory_rule',
          resourceId: id,
        },
        m,
      );
    });
  }

  private async withBrackets(
    m: EntityManager,
    rules: StatutoryRule[],
  ): Promise<StatutoryRuleView[]> {
    if (rules.length === 0) {
      return [];
    }
    const rows = (await m.query(
      `SELECT rule_id AS "ruleId",
              lower_bound::float AS "lowerBound",
              upper_bound::float AS "upperBound",
              rate::float AS rate
         FROM statutory_brackets
        WHERE rule_id = ANY($1)
        ORDER BY lower_bound`,
      [rules.map((r) => r.id)],
    )) as {
      ruleId: string;
      lowerBound: number;
      upperBound: number | null;
      rate: number;
    }[];
    return rules.map((rule) => ({
      ...rule,
      brackets: rows
        .filter((b) => b.ruleId === rule.id)
        .map(({ lowerBound, upperBound, rate: r }) => ({
          lowerBound,
          upperBound,
          rate: r,
        })),
    }));
  }
}

// Applies the rules in force to one employee's pay.
export function chargesFor(
  rules: StatutoryRuleView[],
  basic: number,
  gross: number,
): StatutoryCharge[] {
  return rules
    .map((rule) => {
      const full = rule.base === 'basic' ? basic : gross;
      // A ceiling caps the wage the rate applies to, as CPF's ordinary wage
      // ceiling does; it does not cap the resulting amount.
      const ceiling = Number(rule.wageCeiling ?? 0);
      const base = ceiling > 0 ? Math.min(full, ceiling) : full;

      if (rule.calculation === 'bracket') {
        const employee = bracketAmount(base, rule.brackets);
        return {
          code: rule.code,
          name: rule.name,
          base,
          employee: round2(employee),
          employer: 0,
        };
      }
      return {
        code: rule.code,
        name: rule.name,
        base,
        employee: round2((base * Number(rule.employeeRate)) / 100),
        employer: round2((base * Number(rule.employerRate)) / 100),
      };
    })
    .filter((c) => c.employee > 0 || c.employer > 0);
}

// Progressive: each slab taxes only the part of the base that falls inside it.
function bracketAmount(
  base: number,
  brackets: { lowerBound: number; upperBound: number | null; rate: number }[],
): number {
  let total = 0;
  for (const slab of brackets) {
    if (base <= slab.lowerBound) {
      continue;
    }
    const upper = slab.upperBound ?? base;
    const taxable = Math.min(base, upper) - slab.lowerBound;
    if (taxable > 0) {
      total += (taxable * slab.rate) / 100;
    }
  }
  return total;
}

function requireDate(value: string | undefined, field: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date.`);
  }
  return value;
}

function rate(value: number, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 100) {
    throw new BadRequestException(`${field} must be a percentage between 0 and 100.`);
  }
  return value;
}

// Slabs must start at 0 and tile the range without gaps or overlaps, or some of
// the base would silently escape the calculation.
function validateBrackets(input: BracketInput[] | undefined): {
  lowerBound: number;
  upperBound: number | null;
  rate: number;
}[] {
  if (!input || input.length === 0) {
    throw new BadRequestException(
      'A bracket rule needs at least one bracket.',
    );
  }
  const brackets = input
    .map((b) => ({
      lowerBound: Number(b.lowerBound ?? 0),
      upperBound: b.upperBound == null ? null : Number(b.upperBound),
      rate: rate(Number(b.rate ?? 0), 'bracket rate'),
    }))
    .sort((a, b) => a.lowerBound - b.lowerBound);

  if (brackets[0].lowerBound !== 0) {
    throw new BadRequestException('The first bracket must start at 0.');
  }
  for (const [i, b] of brackets.entries()) {
    const last = i === brackets.length - 1;
    if (!last && b.upperBound == null) {
      throw new BadRequestException(
        'Only the highest bracket may be open-ended.',
      );
    }
    if (b.upperBound != null && b.upperBound <= b.lowerBound) {
      throw new BadRequestException(
        `Bracket starting at ${b.lowerBound} must end above where it starts.`,
      );
    }
    if (!last && brackets[i + 1].lowerBound !== b.upperBound) {
      throw new BadRequestException(
        `Brackets must be contiguous: ${b.upperBound} to ${brackets[i + 1].lowerBound} is a gap or overlap.`,
      );
    }
  }
  return brackets;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
