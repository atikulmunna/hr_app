import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OvertimeInput, OvertimeService } from './overtime.service';

// Overtime claims and their approval gate (FR-M2-06, O-07).
@Controller()
export class OvertimeController {
  constructor(private readonly overtime: OvertimeService) {}

  @Post('me/attendance/overtime')
  request(@CurrentUser() user: AuthUser, @Body() body: OvertimeInput) {
    return this.overtime.requestForSelf(user, body);
  }

  @Get('me/attendance/overtime')
  mine(@CurrentUser() user: AuthUser) {
    return this.overtime.mine(user);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/attendance/overtime')
  forEmployee(@Param('id') id: string) {
    return this.overtime.listForEmployee(id);
  }

  @RequirePermissions('attendance:review')
  @Post('employees/:id/attendance/overtime')
  createFor(
    @Param('id') id: string,
    @Body() body: OvertimeInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.overtime.requestFor(id, body, user);
  }
}
