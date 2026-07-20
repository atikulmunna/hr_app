import { BadRequestException, Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';

// Custom report builder (T-2.7, FR-M10-03). A bounded query surface over three
// datasets: pick one, filter it, optionally group it, and export to CSV, PDF, or
// Excel. Dataset, dimension, and filter names are resolved against a fixed
// whitelist; only filter values come from the caller and are always
// parameterized, so the builder cannot be turned into arbitrary SQL. Every query
// runs inside withTenant, so RLS scopes it to the tenant (FR-M10-05).

type FilterType = 'entity' | 'department' | 'select' | 'dateFrom' | 'dateTo';

interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  sql: string;
  options?: string[];
}
interface FieldDef {
  key: string;
  label: string;
  sql: string;
}
interface DatasetDef {
  label: string;
  from: string;
  baseWhere?: string;
  detail: FieldDef[];
  dimensions: FieldDef[];
  filters: FilterDef[];
  measures: FieldDef[];
  currencySql?: string;
}

export interface ReportSpec {
  dataset?: string;
  filters?: Record<string, string>;
  groupBy?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
}
export interface ReportResult {
  dataset: string;
  label: string;
  grouped: boolean;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export type ExportFormat = 'csv' | 'pdf' | 'xlsx';

const DATASETS: Record<string, DatasetDef> = {
  employees: {
    label: 'Employees',
    from: `employees e
           JOIN legal_entities le ON le.id = e.legal_entity_id
           LEFT JOIN departments d ON d.id = e.department_id`,
    baseWhere: 'e.erased_at IS NULL',
    detail: [
      { key: 'employeeCode', label: 'Code', sql: 'e.employee_code' },
      { key: 'name', label: 'Name', sql: "e.first_name || ' ' || e.last_name" },
      { key: 'entity', label: 'Entity', sql: 'le.name' },
      { key: 'department', label: 'Department', sql: "COALESCE(d.name, 'Unassigned')" },
      { key: 'status', label: 'Status', sql: 'e.status' },
      { key: 'jobTitle', label: 'Job title', sql: 'e.job_title' },
      { key: 'hireDate', label: 'Hire date', sql: "to_char(e.hire_date, 'YYYY-MM-DD')" },
    ],
    dimensions: [
      { key: 'entity', label: 'Entity', sql: 'le.name' },
      { key: 'department', label: 'Department', sql: "COALESCE(d.name, 'Unassigned')" },
      { key: 'status', label: 'Status', sql: 'e.status' },
    ],
    filters: [
      { key: 'legalEntityId', label: 'Entity', type: 'entity', sql: 'e.legal_entity_id' },
      { key: 'departmentId', label: 'Department', type: 'department', sql: 'e.department_id' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        sql: 'e.status',
        options: ['active', 'on_leave', 'terminated'],
      },
    ],
    measures: [],
  },
  payroll: {
    label: 'Payroll register',
    from: `payroll_run_employees pe
           JOIN payroll_runs r ON r.id = pe.run_id
           JOIN employees e ON e.id = pe.employee_id
           JOIN legal_entities le ON le.id = r.legal_entity_id`,
    detail: [
      { key: 'employeeCode', label: 'Code', sql: 'e.employee_code' },
      { key: 'name', label: 'Name', sql: "e.first_name || ' ' || e.last_name" },
      { key: 'entity', label: 'Entity', sql: 'le.name' },
      { key: 'period', label: 'Period', sql: "to_char(r.period_start, 'YYYY-MM')" },
      { key: 'gross', label: 'Gross', sql: 'pe.gross::float' },
      { key: 'deductions', label: 'Deductions', sql: 'pe.deductions::float' },
      { key: 'net', label: 'Net', sql: 'pe.net::float' },
      { key: 'employer', label: 'Employer cost', sql: 'pe.employer_contributions::float' },
      { key: 'currency', label: 'Currency', sql: 'pe.currency_code' },
    ],
    dimensions: [
      { key: 'entity', label: 'Entity', sql: 'le.name' },
      { key: 'period', label: 'Period', sql: "to_char(date_trunc('month', r.period_start), 'YYYY-MM')" },
    ],
    filters: [
      { key: 'legalEntityId', label: 'Entity', type: 'entity', sql: 'r.legal_entity_id' },
      { key: 'from', label: 'Period from', type: 'dateFrom', sql: 'r.period_start' },
      { key: 'to', label: 'Period to', type: 'dateTo', sql: 'r.period_start' },
    ],
    measures: [
      { key: 'gross', label: 'Gross', sql: 'sum(pe.gross)::float' },
      { key: 'net', label: 'Net', sql: 'sum(pe.net)::float' },
      { key: 'employer', label: 'Employer cost', sql: 'sum(pe.employer_contributions)::float' },
    ],
    currencySql: 'pe.currency_code',
  },
  attendance: {
    label: 'Attendance marks',
    from: `attendance_events ev
           JOIN employees e ON e.id = ev.employee_id
           JOIN legal_entities le ON le.id = e.legal_entity_id
           LEFT JOIN departments d ON d.id = e.department_id`,
    detail: [
      { key: 'employeeCode', label: 'Code', sql: 'e.employee_code' },
      { key: 'name', label: 'Name', sql: "e.first_name || ' ' || e.last_name" },
      { key: 'entity', label: 'Entity', sql: 'le.name' },
      { key: 'department', label: 'Department', sql: "COALESCE(d.name, 'Unassigned')" },
      { key: 'eventType', label: 'Event', sql: 'ev.event_type' },
      { key: 'date', label: 'Date', sql: "to_char(ev.server_ts, 'YYYY-MM-DD')" },
      { key: 'band', label: 'Risk band', sql: 'ev.band' },
      { key: 'riskScore', label: 'Risk score', sql: 'ev.risk_score' },
    ],
    dimensions: [
      { key: 'band', label: 'Risk band', sql: 'ev.band' },
      { key: 'department', label: 'Department', sql: "COALESCE(d.name, 'Unassigned')" },
      { key: 'entity', label: 'Entity', sql: 'le.name' },
      { key: 'month', label: 'Month', sql: "to_char(date_trunc('month', ev.server_ts), 'YYYY-MM')" },
    ],
    filters: [
      { key: 'legalEntityId', label: 'Entity', type: 'entity', sql: 'e.legal_entity_id' },
      { key: 'departmentId', label: 'Department', type: 'department', sql: 'e.department_id' },
      {
        key: 'band',
        label: 'Risk band',
        type: 'select',
        sql: 'ev.band',
        options: ['clean', 'yellow', 'red'],
      },
      { key: 'from', label: 'From', type: 'dateFrom', sql: 'ev.server_ts::date' },
      { key: 'to', label: 'To', type: 'dateTo', sql: 'ev.server_ts::date' },
    ],
    measures: [],
  },
};

// The detail row cap: enough for a real export, bounded so a report cannot pull
// the whole table into memory.
const DETAIL_LIMIT = 5000;

@Injectable()
export class ReportService {
  constructor(private readonly db: TenantDbService) {}

  // Metadata the builder UI renders its form from: the datasets, their columns,
  // group dimensions, and filters.
  datasets() {
    return Object.entries(DATASETS).map(([key, def]) => ({
      key,
      label: def.label,
      columns: def.detail.map((c) => ({ key: c.key, label: c.label })),
      dimensions: def.dimensions.map((d) => ({ key: d.key, label: d.label })),
      filters: def.filters.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options ?? null,
      })),
    }));
  }

  run(spec: ReportSpec): Promise<ReportResult> {
    const def = this.dataset(spec);
    const { clause, params } = this.where(def, spec.filters ?? {});
    return this.db.withTenant((m) =>
      spec.groupBy
        ? this.grouped(m, spec.dataset as string, def, spec.groupBy, clause, params)
        : this.detail(m, spec.dataset as string, def, clause, params),
    );
  }

  async export(
    spec: ReportSpec,
    format: ExportFormat,
  ): Promise<{ bytes: Buffer; mime: string; filename: string }> {
    const result = await this.run(spec);
    const base = `${result.dataset}-report`;
    if (format === 'csv') {
      return {
        bytes: Buffer.from(this.toCsv(result), 'utf-8'),
        mime: 'text/csv; charset=utf-8',
        filename: `${base}.csv`,
      };
    }
    if (format === 'xlsx') {
      return {
        bytes: await this.toXlsx(result),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${base}.xlsx`,
      };
    }
    if (format === 'pdf') {
      return {
        bytes: await this.toPdf(result),
        mime: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    throw new BadRequestException('Export format must be csv, pdf, or xlsx.');
  }

  // --- Query building.

  private dataset(spec: ReportSpec): DatasetDef {
    const def = spec.dataset ? DATASETS[spec.dataset] : undefined;
    if (!def) {
      throw new BadRequestException(
        `Unknown dataset. Choose one of: ${Object.keys(DATASETS).join(', ')}.`,
      );
    }
    return def;
  }

  private where(
    def: DatasetDef,
    filters: Record<string, string>,
  ): { clause: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (def.baseWhere) {
      clauses.push(def.baseWhere);
    }
    for (const f of def.filters) {
      const value = filters[f.key];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (f.type === 'select' && f.options && !f.options.includes(value)) {
        throw new BadRequestException(
          `${f.label} must be one of: ${f.options.join(', ')}.`,
        );
      }
      params.push(value);
      const op = f.type === 'dateFrom' ? '>=' : f.type === 'dateTo' ? '<=' : '=';
      clauses.push(`${f.sql} ${op} $${params.length}`);
    }
    return {
      clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  private async detail(
    m: EntityManager,
    dataset: string,
    def: DatasetDef,
    clause: string,
    params: unknown[],
  ): Promise<ReportResult> {
    const select = def.detail.map((c) => `${c.sql} AS "${c.key}"`).join(', ');
    const rows = (await m.query(
      `SELECT ${select} FROM ${def.from} ${clause} ORDER BY 1 LIMIT ${DETAIL_LIMIT}`,
      params,
    )) as Record<string, unknown>[];
    return {
      dataset,
      label: def.label,
      grouped: false,
      columns: def.detail.map((c) => ({ key: c.key, label: c.label })),
      rows,
    };
  }

  private async grouped(
    m: EntityManager,
    dataset: string,
    def: DatasetDef,
    groupByKey: string,
    clause: string,
    params: unknown[],
  ): Promise<ReportResult> {
    const dim = def.dimensions.find((d) => d.key === groupByKey);
    if (!dim) {
      throw new BadRequestException(
        `Cannot group by "${groupByKey}". Options: ${def.dimensions
          .map((d) => d.key)
          .join(', ')}.`,
      );
    }
    const columns: ReportColumn[] = [{ key: 'group', label: dim.label }];
    const selectParts = [`${dim.sql} AS "group"`];
    const groupParts = [dim.sql];
    // Money measures are kept per currency, so a sum never mixes currencies.
    if (def.measures.length && def.currencySql) {
      columns.push({ key: 'currency', label: 'Currency' });
      selectParts.push(`${def.currencySql} AS "currency"`);
      groupParts.push(def.currencySql);
    }
    columns.push({ key: 'count', label: 'Count' });
    selectParts.push('count(*)::int AS "count"');
    for (const measure of def.measures) {
      columns.push({ key: measure.key, label: measure.label });
      selectParts.push(`${measure.sql} AS "${measure.key}"`);
    }
    const rows = (await m.query(
      `SELECT ${selectParts.join(', ')} FROM ${def.from} ${clause}
        GROUP BY ${groupParts.join(', ')} ORDER BY "count" DESC`,
      params,
    )) as Record<string, unknown>[];
    return { dataset, label: def.label, grouped: true, columns, rows };
  }

  // --- Exporters.

  private table(result: ReportResult): { headers: string[]; rows: unknown[][] } {
    const headers = result.columns.map((c) => c.label);
    const rows = result.rows.map((r) => result.columns.map((c) => r[c.key]));
    return { headers, rows };
  }

  private toCsv(result: ReportResult): string {
    const { headers, rows } = this.table(result);
    return stringify([headers, ...rows]);
  }

  private async toXlsx(result: ReportResult): Promise<Buffer> {
    const { headers, rows } = this.table(result);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(result.label.slice(0, 31));
    ws.addRow(headers).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((col) => {
      col.width = 18;
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private toPdf(result: ReportResult): Promise<Buffer> {
    const { headers, rows } = this.table(result);
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    return new Promise((resolve) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(16).text(result.label, { continued: false });
      doc
        .fontSize(9)
        .fillColor('#666')
        .text(
          `${result.grouped ? 'Grouped' : 'Detail'} report, ${rows.length} rows, generated ${new Date()
            .toISOString()
            .slice(0, 10)}`,
        );
      doc.moveDown(0.5);

      const left = doc.page.margins.left;
      const usable =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = usable / headers.length;
      const bottom = doc.page.height - doc.page.margins.bottom;

      const drawRow = (values: unknown[], bold: boolean) => {
        if (doc.y > bottom - 16) {
          doc.addPage();
        }
        const y = doc.y;
        doc.fontSize(8).fillColor('#000');
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
        values.forEach((v, i) => {
          const text = v === null || v === undefined ? '' : this.cell(v);
          doc.text(text, left + i * colWidth + 2, y, {
            width: colWidth - 4,
            height: 12,
            ellipsis: true,
            lineBreak: false,
          });
        });
        doc.moveDown(1);
      };

      drawRow(headers, true);
      rows.forEach((r) => drawRow(r, false));
      doc.end();
    });
  }

  private cell(v: unknown): string {
    if (typeof v === 'number') {
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v);
  }
}
