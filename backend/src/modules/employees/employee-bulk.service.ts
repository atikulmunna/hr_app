import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { TenantDbService } from '../../database/tenant-db.service';
import { EmployeeService } from './employee.service';

// CSV columns, in order. Human-readable references (legal entity and department
// by name, manager by employee code) so the file opens and edits cleanly in a
// spreadsheet, no UUIDs (FR-M12-06).
const COLUMNS = [
  'employeeCode',
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'employmentType',
  'status',
  'hireDate',
  'legalEntity',
  'department',
  'manager',
] as const;

export interface ImportError {
  row: number;
  employeeCode: string | null;
  message: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: ImportError[];
}

type CsvRow = Record<(typeof COLUMNS)[number], string>;

@Injectable()
export class EmployeeBulkService {
  constructor(
    private readonly db: TenantDbService,
    private readonly employees: EmployeeService,
  ) {}

  // Exports all employees as CSV with human-readable references.
  async exportCsv(): Promise<string> {
    const rows: CsvRow[] = await this.db.withTenant((m) =>
      m.query(
        `SELECT e.employee_code AS "employeeCode", e.first_name AS "firstName",
                e.last_name AS "lastName", COALESCE(e.email, '') AS email,
                COALESCE(e.phone, '') AS phone,
                COALESCE(e.job_title, '') AS "jobTitle",
                e.employment_type AS "employmentType", e.status,
                COALESCE(to_char(e.hire_date, 'YYYY-MM-DD'), '') AS "hireDate",
                le.name AS "legalEntity", COALESCE(d.name, '') AS department,
                COALESCE(mgr.employee_code, '') AS manager
         FROM employees e
         JOIN legal_entities le ON le.id = e.legal_entity_id
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employees mgr ON mgr.id = e.manager_id
         ORDER BY e.employee_code`,
      ),
    );
    return stringify(rows, {
      header: true,
      columns: COLUMNS as unknown as string[],
    });
  }

  // Imports a CSV. Each data row is independent: an existing employeeCode
  // updates, a new one creates, and a failing row is reported by its
  // spreadsheet line without aborting the batch.
  async importCsv(csv: string): Promise<ImportResult> {
    if (!csv || !csv.trim()) {
      throw new BadRequestException('The CSV file is empty.');
    }
    let records: CsvRow[];
    try {
      records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (e) {
      throw new BadRequestException(
        `Could not read the CSV: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const refs = await this.referenceMaps();
    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const line = i + 2; // header is line 1
      try {
        const outcome = await this.upsertRow(row, refs);
        if (outcome === 'updated') result.updated += 1;
        else result.created += 1;
      } catch (e) {
        result.errors.push({
          row: line,
          employeeCode: row.employeeCode?.trim() || null,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return result;
  }

  private async upsertRow(
    row: CsvRow,
    refs: ReferenceMaps,
  ): Promise<'created' | 'updated'> {
    const code = row.employeeCode?.trim();
    if (!code) {
      throw new BadRequestException('employeeCode is required.');
    }
    // Source of truth is the DB, so a code repeated within the file updates on
    // its second occurrence (the first create has already committed).
    const existing = await this.employees.findByCode(code);

    const managerId = this.resolveManager(row, refs);
    const legalEntityId = this.resolveEntity(row, refs, !existing);
    const departmentId = this.resolveDepartment(row, refs, legalEntityId);

    if (existing) {
      await this.employees.update(existing.id, {
        firstName: row.firstName?.trim() || existing.firstName,
        lastName: row.lastName?.trim() || existing.lastName,
        email: blankToUndefined(row.email),
        phone: blankToUndefined(row.phone),
        jobTitle: blankToUndefined(row.jobTitle),
        employmentType: blankToUndefined(row.employmentType) as never,
        status: blankToUndefined(row.status) as never,
        departmentId,
        managerId,
        hireDate: blankToUndefined(row.hireDate),
      });
      return 'updated';
    }
    await this.employees.create({
      legalEntityId: legalEntityId!,
      employeeCode: code,
      firstName: row.firstName?.trim(),
      lastName: row.lastName?.trim(),
      email: blankToUndefined(row.email),
      phone: blankToUndefined(row.phone),
      jobTitle: blankToUndefined(row.jobTitle),
      employmentType: blankToUndefined(row.employmentType) as never,
      departmentId,
      managerId,
      hireDate: blankToUndefined(row.hireDate),
    });
    return 'created';
  }

  private resolveEntity(
    row: CsvRow,
    refs: ReferenceMaps,
    required: boolean,
  ): string | undefined {
    const name = row.legalEntity?.trim();
    if (!name) {
      if (required) {
        throw new BadRequestException(
          'legalEntity is required for a new employee.',
        );
      }
      return undefined;
    }
    const id = refs.entities.get(name.toLowerCase());
    if (!id) {
      throw new BadRequestException(`Unknown legal entity "${name}".`);
    }
    return id;
  }

  private resolveDepartment(
    row: CsvRow,
    refs: ReferenceMaps,
    legalEntityId: string | undefined,
  ): string | undefined {
    const name = row.department?.trim();
    if (!name) {
      return undefined;
    }
    const id = refs.departments.get(`${legalEntityId}::${name.toLowerCase()}`);
    if (!id) {
      throw new BadRequestException(
        `Unknown department "${name}" for this legal entity.`,
      );
    }
    return id;
  }

  private resolveManager(row: CsvRow, refs: ReferenceMaps): string | undefined {
    const code = row.manager?.trim();
    if (!code) {
      return undefined;
    }
    const id = refs.managers.get(code);
    if (!id) {
      throw new BadRequestException(`Unknown manager code "${code}".`);
    }
    return id;
  }

  private async referenceMaps(): Promise<ReferenceMaps> {
    return this.db.withTenant(async (m) => {
      const entities: Array<{ id: string; name: string }> = await m.query(
        `SELECT id, name FROM legal_entities`,
      );
      const departments: Array<{ id: string; name: string; leId: string }> =
        await m.query(
          `SELECT id, name, legal_entity_id AS "leId" FROM departments`,
        );
      const employees: Array<{ id: string; code: string }> = await m.query(
        `SELECT id, employee_code AS code FROM employees`,
      );
      return {
        entities: new Map(entities.map((e) => [e.name.toLowerCase(), e.id])),
        departments: new Map(
          departments.map((d) => [`${d.leId}::${d.name.toLowerCase()}`, d.id]),
        ),
        managers: new Map(employees.map((e) => [e.code, e.id])),
      };
    });
  }
}

interface ReferenceMaps {
  entities: Map<string, string>;
  departments: Map<string, string>;
  managers: Map<string, string>;
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
