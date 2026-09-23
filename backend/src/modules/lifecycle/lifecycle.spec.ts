import { BadRequestException } from '@nestjs/common';
import {
  addDays,
  assertKind,
  validateTemplateItems,
} from './checklist.service';
import { buildOrgTree, OrgNodeRow } from './org-chart.service';

function row(id: string, managerId: string | null = null): OrgNodeRow {
  return {
    id,
    employeeCode: `EMP-${id}`,
    name: `Person ${id}`,
    jobTitle: null,
    departmentName: null,
    legalEntityName: 'Oasis Corp',
    managerId,
  };
}

describe('buildOrgTree', () => {
  it('nests reports under their manager and counts the span', () => {
    const tree = buildOrgTree([
      row('ceo'),
      row('cto', 'ceo'),
      row('dev', 'cto'),
      row('ops', 'ceo'),
    ]);
    expect(tree).toHaveLength(1);
    const ceo = tree[0];
    expect(ceo.id).toBe('ceo');
    expect(ceo.span).toBe(3);
    expect(ceo.reports.map((r) => r.id)).toEqual(['cto', 'ops']);
    expect(ceo.reports[0].reports.map((r) => r.id)).toEqual(['dev']);
    expect(ceo.reports[0].span).toBe(1);
    expect(ceo.reports[1].span).toBe(0);
  });

  it('keeps the input order among siblings', () => {
    const tree = buildOrgTree([
      row('boss'),
      row('b', 'boss'),
      row('a', 'boss'),
    ]);
    expect(tree[0].reports.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('promotes an employee whose manager is missing to a root', () => {
    const tree = buildOrgTree([row('a', 'gone'), row('b', 'a')]);
    expect(tree.map((r) => r.id)).toEqual(['a']);
    expect(tree[0].reports.map((r) => r.id)).toEqual(['b']);
  });

  it('treats a self-managed employee as a root', () => {
    const tree = buildOrgTree([row('a', 'a')]);
    expect(tree.map((r) => r.id)).toEqual(['a']);
    expect(tree[0].reports).toEqual([]);
  });

  it('breaks a management cycle instead of looping', () => {
    const tree = buildOrgTree([row('a', 'b'), row('b', 'a'), row('c', 'b')]);
    const ids = tree.map((r) => r.id);
    expect(ids).toHaveLength(1);
    const all = new Set<string>();
    const walk = (nodes: typeof tree) =>
      nodes.forEach((n) => {
        all.add(n.id);
        walk(n.reports);
      });
    walk(tree);
    expect(all).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns an empty chart for no employees', () => {
    expect(buildOrgTree([])).toEqual([]);
  });
});

describe('validateTemplateItems', () => {
  it('normalizes titles, defaults the offset, and keeps order', () => {
    expect(
      validateTemplateItems([
        { title: '  Sign contract ', assigneeRole: 'employee' },
        { title: 'Set up laptop', assigneeRole: 'manager', dueOffsetDays: 1 },
      ]),
    ).toEqual([
      { title: 'Sign contract', assigneeRole: 'employee', dueOffsetDays: 0 },
      { title: 'Set up laptop', assigneeRole: 'manager', dueOffsetDays: 1 },
    ]);
  });

  it('rejects an empty template', () => {
    expect(() => validateTemplateItems([])).toThrow(BadRequestException);
    expect(() => validateTemplateItems(undefined)).toThrow('at least one item');
  });

  it('rejects a blank title, naming the row', () => {
    expect(() =>
      validateTemplateItems([
        { title: 'ok', assigneeRole: 'employee' },
        { title: '   ', assigneeRole: 'employee' },
      ]),
    ).toThrow('Item 2 needs a title.');
  });

  it('rejects a role that cannot own a task', () => {
    expect(() =>
      validateTemplateItems([{ title: 'x', assigneeRole: 'auditor' }]),
    ).toThrow('assigneeRole must be one of employee, manager, hr_admin');
  });

  it('rejects a non-integer or out-of-range offset', () => {
    expect(() =>
      validateTemplateItems([
        { title: 'x', assigneeRole: 'employee', dueOffsetDays: 1.5 },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateTemplateItems([
        { title: 'x', assigneeRole: 'employee', dueOffsetDays: 400 },
      ]),
    ).toThrow(BadRequestException);
    expect(
      validateTemplateItems([
        { title: 'x', assigneeRole: 'employee', dueOffsetDays: -5 },
      ]),
    ).toEqual([{ title: 'x', assigneeRole: 'employee', dueOffsetDays: -5 }]);
  });
});

describe('assertKind and addDays', () => {
  it('accepts only the two checklist kinds', () => {
    expect(assertKind('onboarding')).toBe('onboarding');
    expect(assertKind('offboarding')).toBe('offboarding');
    expect(() => assertKind('exit')).toThrow(BadRequestException);
    expect(() => assertKind(undefined)).toThrow(BadRequestException);
  });

  it('offsets ISO dates across month and year boundaries', () => {
    expect(addDays('2026-01-30', 5)).toBe('2026-02-04');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-07-15', 0)).toBe('2026-07-15');
  });
});
