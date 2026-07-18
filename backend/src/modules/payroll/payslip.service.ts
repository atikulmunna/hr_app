import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import { TenantDbService } from '../../database/tenant-db.service';
import { Employee } from '../../entities/employee.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { PayrollRunService, RunEmployeeView, RunView } from './payroll-run.service';

export interface PayslipSummary {
  runId: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  gross: number;
  deductions: number;
  net: number;
}

// Payslips (FR-M4-09) and the disbursement file (FR-M4-08).
//
// A payslip is rendered from the run's frozen lines rather than stored, so there
// is nothing to keep in step: the run is already the immutable record. Only a
// locked or approved run has payslips, because a draft can still change.
@Injectable()
export class PayslipService {
  constructor(
    private readonly db: TenantDbService,
    private readonly runs: PayrollRunService,
    private readonly employees: EmployeeService,
  ) {}

  // An employee's own payslips, newest first (FR-M9-02).
  async mine(user: AuthUser): Promise<PayslipSummary[]> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.forEmployee(me.id);
  }

  async forEmployee(employeeId: string): Promise<PayslipSummary[]> {
    return this.db.withTenant(async (m) => {
      const rows = (await m.query(
        `SELECT pr.id AS "runId",
                to_char(pr.period_start, 'YYYY-MM-DD') AS "periodStart",
                to_char(pr.period_end, 'YYYY-MM-DD') AS "periodEnd",
                pre.currency_code AS "currencyCode",
                pre.gross::float AS gross,
                pre.deductions::float AS deductions,
                pre.net::float AS net
           FROM payroll_run_employees pre
           JOIN payroll_runs pr ON pr.id = pre.run_id
          WHERE pre.employee_id = $1
            AND pr.status IN ('locked', 'approved')
          ORDER BY pr.period_start DESC`,
        [employeeId],
      )) as PayslipSummary[];
      return rows;
    });
  }

  async myPdf(user: AuthUser, runId: string): Promise<Buffer> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.pdf(runId, me.id);
  }

  async pdf(runId: string, employeeId: string): Promise<Buffer> {
    const run = await this.runs.get(runId);
    if (run.status === 'draft') {
      throw new BadRequestException(
        'This run is still a draft, so it has no payslips yet. Lock it first.',
      );
    }
    const row = run.employees.find((e) => e.employeeId === employeeId);
    if (!row) {
      throw new NotFoundException('This employee is not in that payroll run.');
    }
    const { employee, entity } = await this.db.withTenant(async (m) => {
      const found = await m.findOne(Employee, { where: { id: employeeId } });
      return {
        employee: found,
        entity: await m.findOne(LegalEntity, {
          where: { id: run.legalEntityId },
        }),
      };
    });
    return render(run, row, entity?.name ?? '', employee?.jobTitle ?? '');
  }

  // A bank file for an approved run (FR-M4-08). Only approved: paying out an
  // unapproved run is the exact thing the lock and approval exist to prevent.
  async bankFile(runId: string): Promise<string> {
    const run = await this.runs.get(runId);
    if (run.status !== 'approved') {
      throw new BadRequestException(
        `This run is ${run.status}. Only an approved run can be disbursed.`,
      );
    }
    const rows = run.employees.map((e) => ({
      employee_code: e.employeeCode,
      employee_name: e.name,
      currency: e.currencyCode,
      amount: e.net.toFixed(2),
      period_start: run.periodStart,
      period_end: run.periodEnd,
      reference: `PAY-${run.periodStart.slice(0, 7)}-${e.employeeCode}`,
    }));
    return stringify(rows, { header: true });
  }
}

// Draws the payslip. Deliberately plain: it is a record, not a brochure.
function render(
  run: RunView,
  row: RunEmployeeView,
  entityName: string,
  jobTitle: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const money = (v: number) =>
    `${v.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${run.currencyCode}`;

  doc.fontSize(18).text('Payslip', { align: 'left' });
  doc.fontSize(10).fillColor('#555');
  doc.text(entityName);
  doc.text(`Period ${run.periodStart} to ${run.periodEnd}`);
  if (run.status !== 'approved') {
    doc.fillColor('#b00').text('Provisional: this run is not yet approved.');
  }
  doc.moveDown().fillColor('#000');

  doc.fontSize(12).text(row.name);
  doc.fontSize(10).fillColor('#555').text(`${row.employeeCode}${jobTitle ? ` · ${jobTitle}` : ''}`);
  if (row.prorationFactor < 1) {
    doc.text(
      `Prorated for ${row.payableDays} of ${row.periodDays} days (${run.prorationBasis === 'working_days' ? 'working days' : 'calendar days'})`,
    );
  }
  doc.moveDown().fillColor('#000');

  const earnings = row.lines.filter((l) => l.componentType !== 'deduction');
  const deductions = row.lines.filter((l) => l.componentType === 'deduction');

  doc.fontSize(11).text('Earnings');
  doc.fontSize(10).fillColor('#333');
  for (const line of earnings) {
    doc.text(line.name, { continued: true });
    doc.text(money(line.amount), { align: 'right' });
  }
  if (row.overtimeAmount > 0) {
    doc.text(`Overtime (${row.overtimeHours} h, approved)`, { continued: true });
    doc.text(money(row.overtimeAmount), { align: 'right' });
  }
  doc.fillColor('#000').text('Gross', { continued: true });
  doc.text(money(row.gross), { align: 'right' });
  doc.moveDown();

  doc.fontSize(11).text('Deductions');
  doc.fontSize(10).fillColor('#333');
  for (const line of deductions) {
    const label = line.source === 'statutory' ? `${line.name} (statutory)` : line.name;
    doc.text(label, { continued: true });
    doc.text(`-${money(line.amount)}`, { align: 'right' });
  }
  if (deductions.length === 0) {
    doc.text('None');
  }
  doc.fillColor('#000').text('Total deductions', { continued: true });
  doc.text(`-${money(row.deductions)}`, { align: 'right' });
  doc.moveDown();

  doc.fontSize(13).text('Net pay', { continued: true });
  doc.text(money(row.net), { align: 'right' });

  if (row.employerContributions > 0) {
    doc.moveDown().fontSize(9).fillColor('#555');
    doc.text(
      `Employer contributions of ${money(row.employerContributions)} were paid on your behalf. They are not deducted from your pay.`,
    );
  }

  doc.end();
  return done;
}
