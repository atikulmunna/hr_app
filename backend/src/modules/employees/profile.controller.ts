import { Controller, Get } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { EmployeeService } from './employee.service';

// Self-service: the authenticated caller's own employee profile. Any logged-in
// user may read their own record, so no extra permission is required.
@Controller('me')
export class ProfileController {
  constructor(private readonly employees: EmployeeService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.employees.myProfile(user.sub, user.email);
  }
}
