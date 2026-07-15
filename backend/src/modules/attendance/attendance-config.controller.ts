import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  AttendanceConfigService,
  UpdateConfigInput,
} from './attendance-config.service';

// Per-tenant attendance configuration (T-1C.12). HR reads and tunes the scoring
// and banding knobs; changes take effect on the next mark, no redeployment.
@Controller('attendance/config')
export class AttendanceConfigController {
  constructor(private readonly config: AttendanceConfigService) {}

  @RequirePermissions('attendance:config')
  @Get()
  get() {
    return this.config.get();
  }

  @RequirePermissions('attendance:config')
  @Patch()
  update(@Body() body: UpdateConfigInput, @CurrentUser() user: AuthUser) {
    return this.config.update(body, user.sub);
  }
}
