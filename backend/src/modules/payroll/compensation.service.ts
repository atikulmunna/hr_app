import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { round2 } from './payroll-math';
import { Employee } from '../../entities/employee.entity';
import { EmployeePayComponent } from '../../entities/employee-pay-component.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { PayComponent } from '../../entities/pay-component.entity';
import { AuditService } from '../audit/audit.service';

export interface SetCompensationInput {
  payComponentId?: string;
  amount?: number;
  currencyCode?: string;
  effectiveFrom?: string;
}

// One dated revision, including ones not yet in force. Without this the only way
// to find a scheduled change would be to guess its date in the as-of view.
export interface CompensationRevision {
  id: string;
  payComponentId: string;
  code: string;
  name: string;
  componentType: string;
  amount: number;
  effectiveFrom: string;
}

export interface CompensationLine {
  id: string;
  payComponentId: string;
  code: string;
  name: string;
  componentType: string;
  taxable: boolean;
  amount: number;
  effectiveFrom: string;
}

// An employee's pay structure in their entity's currency (T-2.1), resolved as of
// a date (T-2.2). asOf is the date the amounts were in force on.
export interface CompensationSummary {
  employeeId: string;
  currencyCode: string;
  asOf: string;
  lines: CompensationLine[];
  gross: number;
  deductions: number;
  net: number;
}

@Injectable()
export class CompensationService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  // The structure in force on a date, defaulting to today. A payroll run passes
  // its cut-off here so a later raise cannot value a past period (FR-AT-39).
  forEmployee(employeeId: string, asOf?: string): Promise<CompensationSummary> {
    const on = asOfDate(asOf);
    return this.db.withTenant(async (m) => {
      const employee = await this.findEmployee(m, employeeId);
      const currencyCode = await this.currencyFor(m, employee);
      const lines = await this.lines(m, employeeId, on);
      return { employeeId, currencyCode, asOf: on, ...totals(lines) };
    });
  }

  // Every revision on record, in force or not, newest first per component.
  revisions(employeeId: string): Promise<CompensationRevision[]> {
    return this.db.withTenant(async (m) => {
      await this.findEmployee(m, employeeId);
      const rows = await m.query(
        `SELECT epc.id,
                epc.pay_component_id AS "payComponentId",
                pc.code,
                pc.name,
                pc.component_type AS "componentType",
                epc.amount::float AS amount,
                to_char(epc.effective_from, 'YYYY-MM-DD') AS "effectiveFrom"
           FROM employee_pay_components epc
           JOIN pay_components pc ON pc.id = epc.pay_component_id
          WHERE epc.employee_id = $1
          ORDER BY pc.name, epc.effective_from DESC`,
        [employeeId],
      );
      return rows as CompensationRevision[];
    });
  }

  // Sets the amount for one component from a date. A new date adds a revision
  // and leaves earlier ones intact, so a raise never rewrites what was in force
  // for a past period; setting the same date again corrects that revision.
  // The currency is the employee's entity currency; an explicit mismatching
  // currency is rejected rather than silently converted (FR-M4-03).
  async set(
    employeeId: string,
    input: SetCompensationInput,
  ): Promise<CompensationSummary> {
    const amount = input.amount;
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
      throw new BadRequestException('amount must be a number of 0 or more.');
    }
    if (!input.payComponentId) {
      throw new BadRequestException('payComponentId is required.');
    }
    const effectiveFrom = asOfDate(input.effectiveFrom);
    if (input.effectiveFrom && !isDateOnly(input.effectiveFrom)) {
      throw new BadRequestException('effectiveFrom must be a YYYY-MM-DD date.');
    }

    await this.db.withTenant(async (m) => {
      const employee = await this.findEmployee(m, employeeId);
      const currencyCode = await this.currencyFor(m, employee);
      if (input.currencyCode && input.currencyCode !== currencyCode) {
        throw new BadRequestException(
          `This employee is paid in ${currencyCode}, so ${input.currencyCode} cannot be used. ` +
            'Pay is denominated in the legal entity currency.',
        );
      }

      const component = await m.findOne(PayComponent, {
        where: { id: input.payComponentId },
      });
      if (!component) {
        throw new NotFoundException('Pay component not found.');
      }
      if (!component.active) {
        throw new BadRequestException(
          `Pay component "${component.name}" is inactive.`,
        );
      }
      if (
        component.legalEntityId &&
        component.legalEntityId !== employee.legalEntityId
      ) {
        throw new BadRequestException(
          `Pay component "${component.name}" belongs to another legal entity.`,
        );
      }
      await this.assertSingleBasic(m, employeeId, component, effectiveFrom);

      // Same effective date is a correction; a new date is a new revision.
      const existing = await m.findOne(EmployeePayComponent, {
        where: { employeeId, payComponentId: component.id, effectiveFrom },
      });
      const row = existing
        ? Object.assign(existing, { amount: amount.toFixed(2) })
        : m.create(EmployeePayComponent, {
            tenantId: this.db.tenantId,
            employeeId,
            payComponentId: component.id,
            amount: amount.toFixed(2),
            currencyCode,
            effectiveFrom,
          });
      await m.save(row);
      await this.audit.record(
        {
          action: 'compensation.set',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { code: component.code, amount, currencyCode, effectiveFrom },
        },
        m,
      );
    });

    return this.forEmployee(employeeId, effectiveFrom);
  }

  // Drops a component from the structure entirely, including its revisions. Past
  // payroll runs are unaffected because a run snapshots the amounts it used
  // (D-09); this only changes what future runs will value.
  async remove(
    employeeId: string,
    payComponentId: string,
  ): Promise<CompensationSummary> {
    await this.db.withTenant(async (m) => {
      const result = await m.delete(EmployeePayComponent, {
        employeeId,
        payComponentId,
      });
      if (!result.affected) {
        throw new NotFoundException(
          'This employee has no amount set for that component.',
        );
      }
      await this.audit.record(
        {
          action: 'compensation.remove',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { payComponentId },
        },
        m,
      );
    });
    return this.forEmployee(employeeId);
  }

  private async findEmployee(
    m: EntityManager,
    employeeId: string,
  ): Promise<Employee> {
    const employee = await m.findOne(Employee, { where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    return employee;
  }

  // Pay is denominated in the employee's legal entity currency (FR-M4-03).
  private async currencyFor(
    m: EntityManager,
    employee: Employee,
  ): Promise<string> {
    const entity = await m.findOne(LegalEntity, {
      where: { id: employee.legalEntityId },
    });
    if (!entity) {
      throw new BadRequestException(
        'This employee has no legal entity, so their pay currency is unknown.',
      );
    }
    return entity.currencyCode;
  }

  // 'basic' is the anchor of a structure, so an employee has at most one in
  // force at a time. A different basic taking over from a later date is fine.
  private async assertSingleBasic(
    m: EntityManager,
    employeeId: string,
    component: PayComponent,
    on: string,
  ): Promise<void> {
    if (component.componentType !== 'basic') {
      return;
    }
    const rows = await this.lines(m, employeeId, on);
    const clash = rows.find(
      (l) => l.componentType === 'basic' && l.payComponentId !== component.id,
    );
    if (clash) {
      throw new BadRequestException(
        `This employee already has a basic component ("${clash.name}"). Remove it first.`,
      );
    }
  }

  // The revision of each component in force on `on`: the latest row dated on or
  // before it. Components whose first revision starts later are not yet in force
  // and are absent.
  private async lines(
    m: EntityManager,
    employeeId: string,
    on: string,
  ): Promise<CompensationLine[]> {
    const rows = await m.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (epc.pay_component_id)
                epc.id,
                epc.pay_component_id AS "payComponentId",
                pc.code,
                pc.name,
                pc.component_type AS "componentType",
                pc.taxable,
                epc.amount::float AS amount,
                to_char(epc.effective_from, 'YYYY-MM-DD') AS "effectiveFrom"
           FROM employee_pay_components epc
           JOIN pay_components pc ON pc.id = epc.pay_component_id
          WHERE epc.employee_id = $1
            AND epc.effective_from <= $2
          ORDER BY epc.pay_component_id, epc.effective_from DESC
       ) in_force
       ORDER BY CASE in_force."componentType"
                  WHEN 'basic' THEN 0
                  WHEN 'allowance' THEN 1
                  WHEN 'bonus' THEN 2
                  ELSE 3
                END, in_force.name`,
      [employeeId, on],
    );
    return rows as CompensationLine[];
  }
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// A date-only string, defaulting to today in UTC.
function asOfDate(value?: string): string {
  return value && isDateOnly(value)
    ? value
    : new Date().toISOString().slice(0, 10);
}

// Deductions subtract; every other type adds to gross.
function totals(lines: CompensationLine[]): {
  lines: CompensationLine[];
  gross: number;
  deductions: number;
  net: number;
} {
  const gross = sum(lines.filter((l) => l.componentType !== 'deduction'));
  const deductions = sum(lines.filter((l) => l.componentType === 'deduction'));
  return {
    lines,
    gross: round2(gross),
    deductions: round2(deductions),
    net: round2(gross - deductions),
  };
}

function sum(lines: CompensationLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

