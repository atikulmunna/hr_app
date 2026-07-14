import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  RegularizationInput,
  RegularizationService,
} from './regularization.service';

// Attendance regularization (T-1C.11). Employees submit and view their own
// correction requests; HR reads a given employee's requests and can insert an
// admin correction directly.
@Controller()
export class RegularizationController {
  constructor(private readonly regularization: RegularizationService) {}

  @Post('me/attendance/regularizations')
  submit(@CurrentUser() user: AuthUser, @Body() body: RegularizationInput) {
    return this.regularization.request(user, body);
  }

  @Get('me/attendance/regularizations')
  mine(@CurrentUser() user: AuthUser) {
    return this.regularization.myRequests(user);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/attendance/regularizations')
  forEmployee(@Param('id') id: string) {
    return this.regularization.listForEmployee(id);
  }

  @RequirePermissions('attendance:review')
  @Post('employees/:id/attendance/regularizations')
  adminInsert(
    @Param('id') id: string,
    @Body() body: RegularizationInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.regularization.adminInsert(id, body, user.sub);
  }
}
