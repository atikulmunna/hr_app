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
  AssignRosterInput,
  AssignRosterRangeInput,
  RosterService,
} from './roster.service';
import {
  CreateShiftInput,
  ShiftService,
  UpdateShiftInput,
} from './shift.service';
import { SummaryService } from './summary.service';
import { SwapInput, SwapService } from './swap.service';

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
    private readonly roster: RosterService,
    private readonly swaps: SwapService,
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

  // Per-date roster (T-1E.3). HR and managers manage entries; employees read
  // their own schedule.
  @RequirePermissions('employee:read')
  @Get('employees/:id/roster')
  getRoster(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.roster.listForEmployee(id, from, to);
  }

  @RequirePermissions('employee:manage')
  @Post('employees/:id/roster')
  assignRoster(
    @Param('id') id: string,
    @Body() body: AssignRosterInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roster.assign(id, body, user.sub);
  }

  @RequirePermissions('employee:manage')
  @Post('employees/:id/roster/range')
  assignRosterRange(
    @Param('id') id: string,
    @Body() body: AssignRosterRangeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roster.assignRange(id, body, user.sub);
  }

  @RequirePermissions('employee:manage')
  @Delete('roster/:id')
  removeRoster(@Param('id') id: string) {
    return this.roster.remove(id);
  }

  @Get('me/roster')
  async myRoster(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.roster.listForEmployee(employee.id, from, to);
  }

  // Upcoming roster days of the caller's department peers, to choose a swap
  // counterparty (T-1E.3).
  @Get('me/roster/swappable')
  async mySwappable(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.roster.listSwappable(employee.id, from, to);
  }

  // Shift-swap requests (T-1E.3): self-service, routed to the manager.
  @Post('me/attendance/shift-swaps')
  requestSwap(@CurrentUser() user: AuthUser, @Body() body: SwapInput) {
    return this.swaps.request(user, body);
  }

  @Get('me/attendance/shift-swaps')
  mySwaps(@CurrentUser() user: AuthUser) {
    return this.swaps.myRequests(user);
  }
}
