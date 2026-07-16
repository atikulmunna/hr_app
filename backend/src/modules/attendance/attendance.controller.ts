import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import {
  AttendanceService,
  MarkEventInput,
  OfflineMarkInput,
} from './attendance.service';

interface SyncBody {
  events: OfflineMarkInput[];
}

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

  // Syncs marks captured offline (T-1C.7). Returns a per-event result so the
  // device can clear accepted and duplicate events from its queue.
  @Post('events/sync')
  sync(@CurrentUser() user: AuthUser, @Body() body: SyncBody) {
    return this.attendance.syncOffline(user, body?.events);
  }
}
