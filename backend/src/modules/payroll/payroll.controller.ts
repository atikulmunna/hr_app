import { Response } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CompensationService,
  SetCompensationInput,
} from './compensation.service';
import {
  CreatePayComponentInput,
  PayComponentService,
  UpdatePayComponentInput,
} from './pay-component.service';
import { PayRulesInput, PayRulesService } from './pay-rules.service';
import { PayslipService } from './payslip.service';
import { CreateRunInput, PayrollRunService } from './payroll-run.service';
import {
  CreateStatutoryRuleInput,
  StatutoryService,
} from './statutory.service';

// The pay component catalog and per-employee pay structure (T-2.1), and payroll
// runs (T-2.2).
@Controller()
export class PayrollController {
  constructor(
    private readonly components: PayComponentService,
    private readonly compensation: CompensationService,
    private readonly runs: PayrollRunService,
    private readonly payRules: PayRulesService,
    private readonly statutory: StatutoryService,
    private readonly payslips: PayslipService,
  ) {}

  // Freezes the run and routes it for approval (FR-M4-07). Blocking preview
  // issues refuse the lock.
  @RequirePermissions('payroll:manage')
  @Post('payroll/runs/:id/lock')
  lockRun(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.runs.lock(id, user);
  }

  @RequirePermissions('payroll:read')
  @Get('payroll/runs/:id/payslips/:employeeId')
  @Header('Content-Type', 'application/pdf')
  async payslip(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.payslips.pdf(id, employeeId);
    res.setHeader('Content-Disposition', 'attachment; filename="payslip.pdf"');
    res.end(pdf);
  }

  // The disbursement file for an approved run (FR-M4-08).
  @RequirePermissions('payroll:manage')
  @Get('payroll/runs/:id/bank-file')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="disbursement.csv"')
  bankFile(@Param('id') id: string) {
    return this.payslips.bankFile(id);
  }

  @RequirePermissions('payroll:read')
  @Get('employees/:id/payslips')
  employeePayslips(@Param('id') id: string) {
    return this.payslips.forEmployee(id);
  }

  // Self-service (FR-M9-02): an employee's own payslips.
  @Get('me/payslips')
  myPayslips(@CurrentUser() user: AuthUser) {
    return this.payslips.mine(user);
  }

  @Get('me/payslips/:runId')
  @Header('Content-Type', 'application/pdf')
  async myPayslip(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.payslips.myPdf(user, runId);
    res.setHeader('Content-Disposition', 'attachment; filename="payslip.pdf"');
    res.end(pdf);
  }

  // Statutory deduction rules per jurisdiction (T-2.3, FR-M4-06). Rates are law
  // and change most years, so rules are effective-dated: create a new one with a
  // later date to supersede rather than editing in place.
  @RequirePermissions('payroll:read')
  @Get('statutory-rules')
  listStatutory(@Query('legalEntityId') legalEntityId?: string) {
    return this.statutory.list(legalEntityId);
  }

  // The rules in force on a date, which is what a run resolves at its cut-off.
  @RequirePermissions('payroll:read')
  @Get('statutory-rules/in-force')
  statutoryInForce(
    @Query('legalEntityId') legalEntityId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.statutory.inForce(
      legalEntityId,
      asOf ?? new Date().toISOString().slice(0, 10),
    );
  }

  @RequirePermissions('payroll:manage')
  @Post('statutory-rules')
  createStatutory(@Body() body: CreateStatutoryRuleInput) {
    return this.statutory.create(body);
  }

  @RequirePermissions('payroll:manage')
  @Patch('statutory-rules/:id')
  updateStatutory(@Param('id') id: string, @Body() body: { active?: boolean }) {
    return this.statutory.setActive(id, body?.active !== false);
  }

  @RequirePermissions('payroll:manage')
  @Delete('statutory-rules/:id')
  removeStatutory(@Param('id') id: string) {
    return this.statutory.remove(id);
  }

  // The entity's pay policy: proration basis and the overtime rate rule. These
  // are company and jurisdiction decisions, so HR can change them (O-06, O-08).
  @RequirePermissions('payroll:manage')
  @Patch('entities/:id/pay-rules')
  updatePayRules(@Param('id') id: string, @Body() body: PayRulesInput) {
    return this.payRules.update(id, body);
  }

  @RequirePermissions('payroll:read')
  @Get('payroll/runs')
  listRuns(@Query('legalEntityId') legalEntityId?: string) {
    return this.runs.list(legalEntityId);
  }

  @RequirePermissions('payroll:manage')
  @Post('payroll/runs')
  createRun(@Body() body: CreateRunInput, @CurrentUser() user: AuthUser) {
    return this.runs.create(body, user);
  }

  @RequirePermissions('payroll:read')
  @Get('payroll/runs/:id')
  getRun(@Param('id') id: string) {
    return this.runs.get(id);
  }

  // Rebuilds the run from current data, picking up marks and corrections that
  // landed after the cut-off but before lock (FR-AT-39).
  @RequirePermissions('payroll:manage')
  @Post('payroll/runs/:id/recompute')
  recomputeRun(@Param('id') id: string) {
    return this.runs.compute(id);
  }

  @RequirePermissions('payroll:manage')
  @Delete('payroll/runs/:id')
  removeRun(@Param('id') id: string) {
    return this.runs.remove(id);
  }

  @RequirePermissions('payroll:read')
  @Get('pay-components')
  list(@Query('activeOnly') activeOnly?: string) {
    return this.components.list(activeOnly === 'true');
  }

  @RequirePermissions('payroll:manage')
  @Post('pay-components')
  create(@Body() body: CreatePayComponentInput) {
    return this.components.create(body);
  }

  @RequirePermissions('payroll:manage')
  @Patch('pay-components/:id')
  update(@Param('id') id: string, @Body() body: UpdatePayComponentInput) {
    return this.components.update(id, body);
  }

  // asOf resolves the structure in force on that date; defaults to today.
  @RequirePermissions('payroll:read')
  @Get('employees/:id/compensation')
  forEmployee(@Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.compensation.forEmployee(id, asOf);
  }

  // Declared before the :payComponentId route so "revisions" is not read as an id.
  @RequirePermissions('payroll:read')
  @Get('employees/:id/compensation/revisions')
  revisions(@Param('id') id: string) {
    return this.compensation.revisions(id);
  }

  @RequirePermissions('payroll:manage')
  @Post('employees/:id/compensation')
  set(@Param('id') id: string, @Body() body: SetCompensationInput) {
    return this.compensation.set(id, body);
  }

  @RequirePermissions('payroll:manage')
  @Delete('employees/:id/compensation/:payComponentId')
  remove(
    @Param('id') id: string,
    @Param('payComponentId') payComponentId: string,
  ) {
    return this.compensation.remove(id, payComponentId);
  }
}
