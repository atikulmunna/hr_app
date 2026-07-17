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

// The pay component catalog and per-employee pay structure (T-2.1).
@Controller()
export class PayrollController {
  constructor(
    private readonly components: PayComponentService,
    private readonly compensation: CompensationService,
  ) {}

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
