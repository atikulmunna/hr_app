import { Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DataSubjectService } from './data-subject.service';

// Data-subject requests (T-1F.2, FR-M13-04, DR-04): an employee exports their
// own data; HR exports or erases an employee's data on request.
@Controller()
export class DataSubjectController {
  constructor(private readonly dataSubject: DataSubjectService) {}

  @Get('me/data-export')
  exportSelf(@CurrentUser() user: AuthUser) {
    return this.dataSubject.exportSelf(user);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/data-export')
  exportFor(@Param('id') id: string) {
    return this.dataSubject.exportFor(id);
  }

  @RequirePermissions('employee:manage')
  @Post('employees/:id/erasure')
  erase(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dataSubject.erase(id, user.sub);
  }
}
