import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ApplyLeaveInput, LeaveRequestService } from './leave-request.service';

// Leave requests (T-1D.2). Employees apply and view their own requests and
// balances; HR and managers read a given employee's requests.
@Controller()
export class LeaveRequestController {
  constructor(private readonly leave: LeaveRequestService) {}

  @Post('me/leave/requests')
  apply(@CurrentUser() user: AuthUser, @Body() body: ApplyLeaveInput) {
    return this.leave.apply(user, body);
  }

  @Get('me/leave/requests')
  mine(@CurrentUser() user: AuthUser) {
    return this.leave.myRequests(user);
  }

  @Get('me/leave/balances')
  balances(@CurrentUser() user: AuthUser) {
    return this.leave.myBalances(user);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/leave/requests')
  forEmployee(@Param('id') id: string) {
    return this.leave.requestsFor(id);
  }
}
