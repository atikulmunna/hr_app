import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { EmployeeService } from './employee.service';
import {
  ProfileChangeInput,
  ProfileChangeService,
} from './profile-change.service';

interface ContactUpdate {
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

// Self-service: the authenticated caller's own employee profile. Any logged-in
// user may read and edit their own record, so no extra permission is required.
// Non-sensitive contact fields are edited directly; a name change is submitted
// for HR approval (T-1E.1, FR-M9-01).
@Controller('me')
export class ProfileController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly profileChanges: ProfileChangeService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.employees.myProfile(user.sub, user.email);
  }

  @Patch('profile')
  updateContact(@CurrentUser() user: AuthUser, @Body() body: ContactUpdate) {
    return this.employees.selfUpdateContact(user.sub, user.email, body);
  }

  @Post('profile/change-requests')
  requestChange(@CurrentUser() user: AuthUser, @Body() body: ProfileChangeInput) {
    return this.profileChanges.request(user, body);
  }

  @Get('profile/change-requests')
  myChangeRequests(@CurrentUser() user: AuthUser) {
    return this.profileChanges.myRequests(user);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.employees.myHistory(user.sub, user.email);
  }
}
