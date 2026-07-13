import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CreateHolidayInput,
  CreateLeaveTypeInput,
  LeaveService,
  UpdateLeaveTypeInput,
} from './leave.service';

// Leave policy configuration (T-1D.1). Reads are open to any authenticated user
// so employees can pick a type when applying; writes need leave:manage.
@Controller()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('leave-types')
  listTypes() {
    return this.leave.listTypes();
  }

  @RequirePermissions('leave:manage')
  @Post('leave-types')
  createType(@Body() body: CreateLeaveTypeInput) {
    return this.leave.createType(body);
  }

  @RequirePermissions('leave:manage')
  @Patch('leave-types/:id')
  updateType(@Param('id') id: string, @Body() body: UpdateLeaveTypeInput) {
    return this.leave.updateType(id, body);
  }

  @Get('holidays')
  listHolidays() {
    return this.leave.listHolidays();
  }

  @RequirePermissions('leave:manage')
  @Post('holidays')
  createHoliday(@Body() body: CreateHolidayInput) {
    return this.leave.createHoliday(body);
  }

  @RequirePermissions('leave:manage')
  @Delete('holidays/:id')
  deleteHoliday(@Param('id') id: string) {
    return this.leave.deleteHoliday(id);
  }
}
