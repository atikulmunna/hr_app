import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { AttendanceService, MarkEventInput } from './attendance.service';

// Self-service attendance for the authenticated employee.
@Controller('me/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.today(user);
  }

  @Post('events')
  mark(@CurrentUser() user: AuthUser, @Body() body: MarkEventInput) {
    return this.attendance.mark(user, body);
  }
}
