import { BadRequestException } from '@nestjs/common';

// Pure payroll arithmetic and preview rules, kept free of the database so the
// money math is unit-testable on its own. PayrollRunService reads the inputs and
// persists the outputs; nothing here touches an EntityManager.

// A preview finding (FR-M4-07). 'blocking' stops the lock, because paying it
// would be wrong; 'warning' is worth a look but is a legitimate state.
export interface RunIssue {
  severity: 'blocking' | 'warning';
  employeeCode?: string;
  message: string;
}

// The slice of a computed employee row that the preview rules look at.
export interface IssueCandidate {
  employeeCode: string;
  net: number;
  overtimeHours: number;
  overtimeAmount: number;
  absentDays: number;
  lines: unknown[];
}

// The entity pay-rule knobs overtime needs (O-08).
export interface OvertimeRule {
  overtimeBase: 'basic' | 'gross';
  overtimeDivisor: 'expected_hours' | 'fixed_hours';
  overtimeFixedHours?: string | null;
  overtimeMultiplier: string;
}

export function requireDate(value: string | undefined, field: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date.`);
  }
  return value;
}

export function laterOf(periodStart: string, hireDate: string | null): string {
  return hireDate && hireDate > periodStart ? hireDate : periodStart;
}

export function earlierOf(periodEnd: string, terminatedOn: string | null): string {
  return terminatedOn && terminatedOn < periodEnd ? terminatedOn : periodEnd;
}

// Days between two dates inclusive, counted on the entity's basis. A working day
// excludes weekends and the entity's holidays; rest days are Sat/Sun until
// per-entity rest days land (deferred in T-1C.9).
export function countDays(
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
export function prorationFactor(payableDays: number, periodDays: number): number {
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
export function overtimePay(
  hours: number,
  lines: { componentType: string; amount: number }[],
  entity: OvertimeRule,
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

export function sum(lines: { amount: string }[]): number {
  return lines.reduce((total, line) => total + Number(line.amount), 0);
}

// Rounds money to cents, half away from zero, on the decimal value rather than
// its binary approximation.
//
// `Math.round(value * 100) / 100` gets this wrong whenever an amount lands
// exactly on half a cent, which percentages and prorations do often: 1.005 is
// held as 1.00499999999999989, so it rounded down to 1.00 while the arithmetic
// says 1.01. Scaling first and re-reading the product at 15 significant digits
// discards that noise (100.49999999999999 reads back as 100.5), and rounding
// the magnitude keeps a negative adjustment symmetrical with a positive one.
export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const scaled = Number((value * 100).toPrecision(15));
  const cents = Math.round(Math.abs(scaled)) * Math.sign(scaled);
  return cents === 0 ? 0 : cents / 100;
}

// What a reviewer must see before locking (FR-M4-07). Anything blocking would
// make the run wrong to pay, not merely unusual.
export function previewIssues(employees: IssueCandidate[]): RunIssue[] {
  const issues: RunIssue[] = [];
  if (employees.length === 0) {
    issues.push({
      severity: 'blocking',
      message: 'the run has no employees in scope',
    });
  }
  for (const e of employees) {
    // A real employee always has a structure, so nothing in force is a
    // data-entry gap that reads identically to a legitimate zero.
    if (e.lines.length === 0) {
      issues.push({
        severity: 'blocking',
        employeeCode: e.employeeCode,
        message: 'no pay components are in force at the cut-off',
      });
    } else if (e.net === 0) {
      issues.push({
        severity: 'blocking',
        employeeCode: e.employeeCode,
        message: 'nets zero for the period',
      });
    }
    if (e.net < 0) {
      issues.push({
        severity: 'blocking',
        employeeCode: e.employeeCode,
        message: `deductions exceed gross, netting ${e.net}`,
      });
    }
    // Hours were approved but could not be rated, so they would go unpaid.
    if (e.overtimeHours > 0 && e.overtimeAmount === 0) {
      issues.push({
        severity: 'blocking',
        employeeCode: e.employeeCode,
        message: `${e.overtimeHours} h of approved overtime could not be rated`,
      });
    }
    if (e.absentDays > 0) {
      issues.push({
        severity: 'warning',
        employeeCode: e.employeeCode,
        message: `${e.absentDays} unreversed absent day(s) in the period`,
      });
    }
  }
  return issues;
}

// Only a draft can change. Once locked, the run is the record of what was
// approved, and a correction is an off-cycle adjustment (D-09, FR-AT-41).
export function assertDraft(run: { status: string }, action: string): void {
  if (run.status !== 'draft') {
    throw new BadRequestException(
      `This run is ${run.status} and cannot be ${action}. ` +
        'Correct a locked period with an off-cycle adjustment instead.',
    );
  }
}
