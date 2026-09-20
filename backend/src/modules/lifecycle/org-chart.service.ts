import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../../database/tenant-db.service';

export interface OrgNodeRow {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle: string | null;
  departmentName: string | null;
  legalEntityName: string;
  managerId: string | null;
}

export interface OrgNode extends OrgNodeRow {
  // Everyone below this person, direct and indirect.
  span: number;
  reports: OrgNode[];
}

// Nests a flat employee list into trees by manager. A root is an employee with
// no manager, or whose manager is not in the list (left, erased, inactive), so
// nobody disappears from the chart because their manager did. A cycle (A
// manages B manages A, a data-entry mistake) is broken at the first repeated
// node so the chart still renders.
export function buildOrgTree(rows: OrgNodeRow[]): OrgNode[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<string, OrgNodeRow[]>();
  const roots: OrgNodeRow[] = [];
  for (const row of rows) {
    if (row.managerId && byId.has(row.managerId) && row.managerId !== row.id) {
      const list = children.get(row.managerId) ?? [];
      list.push(row);
      children.set(row.managerId, list);
    } else {
      roots.push(row);
    }
  }
  const visited = new Set<string>();
  const build = (row: OrgNodeRow): OrgNode => {
    visited.add(row.id);
    const reports = (children.get(row.id) ?? [])
      .filter((c) => !visited.has(c.id))
      .map(build);
    const span = reports.reduce((total, r) => total + 1 + r.span, 0);
    return { ...row, span, reports };
  };
  const tree = roots.map(build);
  // Anyone only reachable through a cycle has no root; surface them as roots
  // rather than dropping them.
  for (const row of rows) {
    if (!visited.has(row.id)) {
      tree.push(build(row));
    }
  }
  return tree;
}

// The org chart derived from the reporting hierarchy (T-3.4b, FR-M1-06).
@Injectable()
export class OrgChartService {
  constructor(private readonly db: TenantDbService) {}

  chart(): Promise<{ headcount: number; roots: OrgNode[] }> {
    return this.db.withTenant(async (m) => {
      const rows = (await m.query(
        `SELECT e.id,
                e.employee_code AS "employeeCode",
                e.first_name || ' ' || e.last_name AS name,
                e.job_title AS "jobTitle",
                d.name AS "departmentName",
                le.name AS "legalEntityName",
                e.manager_id AS "managerId"
           FROM employees e
           JOIN legal_entities le ON le.id = e.legal_entity_id
           LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.erased_at IS NULL AND e.status <> 'terminated'
          ORDER BY e.first_name, e.last_name`,
      )) as OrgNodeRow[];
      return { headcount: rows.length, roots: buildOrgTree(rows) };
    });
  }
}
