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
import { CreateGeofenceInput, GeofenceService } from './geofence.service';

interface SetActiveBody {
  active: boolean;
}

interface AssignBody {
  geofenceId: string;
}

// Geofence configuration (org-level) and per-employee geofence assignment.
@Controller()
export class GeofencesController {
  constructor(private readonly geofences: GeofenceService) {}

  @RequirePermissions('entity:read')
  @Get('geofences')
  list() {
    return this.geofences.list();
  }

  @RequirePermissions('entity:manage')
  @Post('geofences')
  create(@Body() body: CreateGeofenceInput) {
    return this.geofences.create(body);
  }

  @RequirePermissions('entity:manage')
  @Patch('geofences/:id')
  setActive(@Param('id') id: string, @Body() body: SetActiveBody) {
    return this.geofences.setActive(id, body.active);
  }

  @RequirePermissions('employee:read')
  @Get('employees/:id/geofences')
  listForEmployee(@Param('id') id: string) {
    return this.geofences.listForEmployee(id);
  }

  @RequirePermissions('employee:manage')
  @Post('employees/:id/geofences')
  assign(@Param('id') id: string, @Body() body: AssignBody) {
    return this.geofences.assign(id, body.geofenceId);
  }

  @RequirePermissions('employee:manage')
  @Delete('employees/:id/geofences/:geofenceId')
  unassign(@Param('id') id: string, @Param('geofenceId') geofenceId: string) {
    return this.geofences.unassign(id, geofenceId);
  }
}
