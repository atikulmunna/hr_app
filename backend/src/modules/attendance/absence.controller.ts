import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AbsenceService } from './absence.service';

interface RunBody {
  date?: string;
}

interface ReverseBody {
  reason?: string;
}

// Manual trigger, reversal, and per-employee list for the absence job (T-1C.10).
// The daily sweep runs on a schedule; this endpoint lets HR run it for a
// specific date (backfill) or reverse a record on correction.
@Controller()
export class AbsenceController {
  constructor(private readonly absence: AbsenceService) {}

  @RequirePermissions('attendance:review')
  @Post('attendance/absence-run')
  run(@Body() body: RunBody) {
    return this.absence.runForDate(body?.date ?? yesterday());
  }

  @RequirePermissions('attendance:review')
  @Post('attendance/absences/:id/reverse')
  reverse(
    @Param('id') id: string,
    @Body() body: ReverseBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.absence.reverse(id, user.sub, body?.reason);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/absences')
  forEmployee(@Param('id') id: string) {
    return this.absence.listForEmployee(id);
  }
}

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
