import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { TeamService } from './team.service';

// Manager self-service (T-1E.2). Self-scoped to the caller's own direct
// reports; any authenticated user may call it (a non-manager simply has an
// empty team).
@Controller('me/team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  reports(@CurrentUser() user: AuthUser) {
    return this.team.directReports(user);
  }

  @Get('attendance')
  attendance(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.team.teamAttendance(user, from, to);
  }

  @Get('leave')
  leave(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.team.teamLeave(user, from, to);
  }
}
