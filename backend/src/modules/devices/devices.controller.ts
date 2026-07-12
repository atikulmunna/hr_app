import { Controller, Get, Param } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DeviceService } from './device.service';

// Read access to device bindings: admins per employee, employees for their own.
@Controller()
export class DevicesController {
  constructor(private readonly devices: DeviceService) {}

  @RequirePermissions('employee:read')
  @Get('employees/:id/devices')
  forEmployee(@Param('id') id: string) {
    return this.devices.listForEmployee(id);
  }

  @Get('me/devices')
  mine(@CurrentUser() user: AuthUser) {
    return this.devices.listMine(user.sub, user.email);
  }
}
