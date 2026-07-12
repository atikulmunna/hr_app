import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DeviceService, RebindRequestInput } from './device.service';

// Read access to device bindings and history, plus the employee's re-bind
// request. Admins act per employee; employees act on their own device.
@Controller()
export class DevicesController {
  constructor(private readonly devices: DeviceService) {}

  @RequirePermissions('employee:read')
  @Get('employees/:id/devices')
  forEmployee(@Param('id') id: string) {
    return this.devices.listForEmployee(id);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/device-history')
  historyForEmployee(@Param('id') id: string) {
    return this.devices.historyForEmployee(id);
  }

  @Get('me/devices')
  mine(@CurrentUser() user: AuthUser) {
    return this.devices.listMine(user.sub, user.email);
  }

  @Get('me/device-history')
  myHistory(@CurrentUser() user: AuthUser) {
    return this.devices.historyMine(user.sub, user.email);
  }

  @Post('me/devices/rebind-requests')
  requestRebind(
    @CurrentUser() user: AuthUser,
    @Body() body: RebindRequestInput,
  ) {
    return this.devices.requestRebind(user.sub, user.email, body);
  }
}
