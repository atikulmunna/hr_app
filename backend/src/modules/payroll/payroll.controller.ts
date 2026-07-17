import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { CreateRunInput, PayrollRunService } from './payroll-run.service';

// The pay component catalog and per-employee pay structure (T-2.1), and payroll
// runs (T-2.2).
@Controller()
export class PayrollController {
  constructor(
    private readonly components: PayComponentService,
    private readonly compensation: CompensationService,
    private readonly runs: PayrollRunService,
    private readonly payRules: PayRulesService,
  ) {}

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
