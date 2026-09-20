import { BadRequestException } from '@nestjs/common';
import {
  assertDraft,
  countDays,
  earlierOf,
  laterOf,
  overtimePay,
  OvertimeRule,
  previewIssues,
  prorationFactor,
  requireDate,
  round2,
  sum,
} from './payroll-math';

describe('requireDate', () => {
  it('accepts a YYYY-MM-DD date and returns it unchanged', () => {
    expect(requireDate('2026-07-01', 'periodStart')).toBe('2026-07-01');
  });

  it.each([undefined, '', '2026-7-1', '01/07/2026', '2026-13-45', 'yesterday'])(
    'rejects %p with the field name in the message',
    (value) => {
      expect(() => requireDate(value, 'cutoffDate')).toThrow(BadRequestException);
      expect(() => requireDate(value, 'cutoffDate')).toThrow(
        'cutoffDate must be a YYYY-MM-DD date.',
      );
    },
  );
});

describe('employment bounds within a period', () => {
  it('starts at the hire date when the employee joined mid-period', () => {
    expect(laterOf('2026-07-01', '2026-07-15')).toBe('2026-07-15');
    expect(laterOf('2026-07-01', '2026-06-01')).toBe('2026-07-01');
    expect(laterOf('2026-07-01', null)).toBe('2026-07-01');
  });

  it('ends at the termination date when the employee left mid-period', () => {
    expect(earlierOf('2026-07-31', '2026-07-20')).toBe('2026-07-20');
    expect(earlierOf('2026-07-31', '2026-08-05')).toBe('2026-07-31');
    expect(earlierOf('2026-07-31', null)).toBe('2026-07-31');
  });
});

describe('countDays', () => {
  // July 2026 has 31 days; 23 weekdays (starts on a Wednesday).
  it('counts every day on the calendar basis', () => {
    expect(countDays('2026-07-01', '2026-07-31', 'calendar_days', [])).toBe(31);
  });

  it('excludes weekends on the working-days basis', () => {
    expect(countDays('2026-07-01', '2026-07-31', 'working_days', [])).toBe(23);
  });

  it('excludes holidays that fall on weekdays but not those on weekends', () => {
    // 2026-07-06 is a Monday, 2026-07-04 is a Saturday.
    expect(
      countDays('2026-07-01', '2026-07-31', 'working_days', ['2026-07-06', '2026-07-04']),
    ).toBe(22);
  });

  it('ignores holidays on the calendar basis', () => {
    expect(
      countDays('2026-07-01', '2026-07-31', 'calendar_days', ['2026-07-06']),
    ).toBe(31);
  });

  it('counts a single day inclusively and an inverted range as zero', () => {
    expect(countDays('2026-07-01', '2026-07-01', 'calendar_days', [])).toBe(1);
    expect(countDays('2026-07-31', '2026-07-01', 'calendar_days', [])).toBe(0);
  });
});

describe('prorationFactor', () => {
  it('is the payable share of the period, clamped to [0, 1]', () => {
    expect(prorationFactor(15, 30)).toBe(0.5);
    expect(prorationFactor(30, 30)).toBe(1);
    expect(prorationFactor(45, 30)).toBe(1);
    expect(prorationFactor(-3, 30)).toBe(0);
  });

  it('does not prorate when the period has no countable days', () => {
    expect(prorationFactor(0, 0)).toBe(1);
    expect(prorationFactor(5, -1)).toBe(1);
  });
});

describe('overtimePay', () => {
  const lines = [
    { componentType: 'basic', amount: 3000 },
    { componentType: 'allowance', amount: 500 },
    { componentType: 'deduction', amount: 200 },
  ];
  const period = { expectedHoursPerDay: 8, workingDays: 22 };

  const singapore: OvertimeRule = {
    overtimeBase: 'basic',
    overtimeDivisor: 'fixed_hours',
    overtimeFixedHours: '190.67',
    overtimeMultiplier: '1.50',
  };

  it('applies base / fixed hours x multiplier x hours', () => {
    // 3000 / 190.67 * 1.5 * 10 = 236.0099...
    expect(overtimePay(10, lines, singapore, period)).toBe(236.01);
  });

  it('derives the divisor from the shift when configured for expected hours', () => {
    const rule: OvertimeRule = {
      ...singapore,
      overtimeDivisor: 'expected_hours',
      overtimeFixedHours: null,
    };
    // 3000 / (8 * 22) * 1.5 * 4 = 102.27...
    expect(overtimePay(4, lines, rule, period)).toBe(102.27);
  });

  it('bases the rate on gross excluding deductions when configured', () => {
    const rule: OvertimeRule = { ...singapore, overtimeBase: 'gross' };
    // (3000 + 500) / 190.67 * 1.5 * 2 = 55.07...
    expect(overtimePay(2, lines, rule, period)).toBe(55.07);
  });

  it('pays nothing for zero or negative hours', () => {
    expect(overtimePay(0, lines, singapore, period)).toBe(0);
    expect(overtimePay(-1, lines, singapore, period)).toBe(0);
  });

  it('returns zero when the rate cannot be derived', () => {
    expect(overtimePay(5, [], singapore, period)).toBe(0);
    expect(
      overtimePay(5, lines, { ...singapore, overtimeFixedHours: null }, period),
    ).toBe(0);
    const shiftless: OvertimeRule = { ...singapore, overtimeDivisor: 'expected_hours' };
    expect(
      overtimePay(5, lines, shiftless, { expectedHoursPerDay: 0, workingDays: 22 }),
    ).toBe(0);
  });
});

describe('sum and round2', () => {
  it('sums string amounts as the pg driver returns numeric columns', () => {
    expect(sum([{ amount: '100.10' }, { amount: '0.20' }])).toBeCloseTo(100.3);
    expect(sum([])).toBe(0);
  });

  it('rounds to cents and cleans float noise', () => {
    expect(round2(236.0099)).toBe(236.01);
    expect(round2(102.272727)).toBe(102.27);
    expect(round2(-1.234)).toBe(-1.23);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  // Known limitation of double arithmetic: a value that sits exactly on a half
  // cent rounds by its binary representation, not half-up. 1.005 is stored just
  // below the half and 2.675 just above it. Moving payroll to integer cents
  // would make both round the same way; until then this pins the behaviour so
  // a change is deliberate.
  it('documents half-cent rounding by float representation', () => {
    expect(round2(1.005)).toBe(1);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe('previewIssues', () => {
  const clean = {
    employeeCode: 'EMP-001',
    net: 2500,
    overtimeHours: 0,
    overtimeAmount: 0,
    absentDays: 0,
    lines: [{}],
  };

  it('blocks an empty run', () => {
    expect(previewIssues([])).toEqual([
      { severity: 'blocking', message: 'the run has no employees in scope' },
    ]);
  });

  it('raises nothing for a normal row', () => {
    expect(previewIssues([clean])).toEqual([]);
  });

  it('blocks an employee with no components in force, and only that', () => {
    const issues = previewIssues([{ ...clean, net: 0, lines: [] }]);
    expect(issues).toEqual([
      {
        severity: 'blocking',
        employeeCode: 'EMP-001',
        message: 'no pay components are in force at the cut-off',
      },
    ]);
  });

  it('blocks a zero net when components exist', () => {
    expect(previewIssues([{ ...clean, net: 0 }])).toEqual([
      { severity: 'blocking', employeeCode: 'EMP-001', message: 'nets zero for the period' },
    ]);
  });

  it('blocks a negative net', () => {
    expect(previewIssues([{ ...clean, net: -40 }])).toEqual([
      {
        severity: 'blocking',
        employeeCode: 'EMP-001',
        message: 'deductions exceed gross, netting -40',
      },
    ]);
  });

  it('blocks approved overtime that could not be rated', () => {
    expect(previewIssues([{ ...clean, overtimeHours: 3, overtimeAmount: 0 }])).toEqual([
      {
        severity: 'blocking',
        employeeCode: 'EMP-001',
        message: '3 h of approved overtime could not be rated',
      },
    ]);
    expect(previewIssues([{ ...clean, overtimeHours: 3, overtimeAmount: 50 }])).toEqual([]);
  });

  it('warns, but does not block, on unreversed absences', () => {
    expect(previewIssues([{ ...clean, absentDays: 2 }])).toEqual([
      {
        severity: 'warning',
        employeeCode: 'EMP-001',
        message: '2 unreversed absent day(s) in the period',
      },
    ]);
  });

  it('reports one issue per rule per employee', () => {
    const issues = previewIssues([
      { ...clean, employeeCode: 'A', net: -1, absentDays: 1 },
      { ...clean, employeeCode: 'B' },
    ]);
    expect(issues.map((i) => [i.employeeCode, i.severity])).toEqual([
      ['A', 'blocking'],
      ['A', 'warning'],
    ]);
  });
});

describe('assertDraft', () => {
  it('lets a draft through', () => {
    expect(() => assertDraft({ status: 'draft' }, 'locked')).not.toThrow();
  });

  it.each(['locked', 'approved', 'paid'])('rejects a %s run', (status) => {
    expect(() => assertDraft({ status }, 'recomputed')).toThrow(
      `This run is ${status} and cannot be recomputed.`,
    );
  });
});
