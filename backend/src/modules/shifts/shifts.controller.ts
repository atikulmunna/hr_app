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
import { EmployeeService } from '../employees/employee.service';
import {
  CreateShiftInput,
  ShiftService,
  UpdateShiftInput,
} from './shift.service';
import { SummaryService } from './summary.service';

interface AssignShiftBody {
  shiftId: string;
}

// Shift configuration, per-employee assignment, and derived attendance
// summaries (T-1C.9).
@Controller()
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftService,
    private readonly summaries: SummaryService,
    private readonly employees: EmployeeService,
  ) {}

  @RequirePermissions('entity:read')
  @Get('shifts')
  list() {
    return this.shifts.list();
  }

  @RequirePermissions('entity:manage')
  @Post('shifts')
  create(@Body() body: CreateShiftInput) {
    return this.shifts.create(body);
  }

  @RequirePermissions('entity:manage')
  @Patch('shifts/:id')
  update(@Param('id') id: string, @Body() body: UpdateShiftInput) {
    return this.shifts.update(id, body);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/shift')
  forEmployee(@Param('id') id: string) {
    return this.shifts.getForEmployee(id);
  }

  @RequirePermissions('employee:manage')
  @Post('employees/:id/shift')
  assign(@Param('id') id: string, @Body() body: AssignShiftBody) {
    return this.shifts.assign(id, body.shiftId);
  }

  @RequirePermissions('employee:manage')
  @Delete('employees/:id/shift')
  unassign(@Param('id') id: string) {
    return this.shifts.unassign(id);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/attendance-summary')
  summary(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.summaries.summary(id, from, to);
  }

  @Get('me/attendance/summary')
  async mySummary(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.summaries.summary(employee.id, from, to);
  }
}
