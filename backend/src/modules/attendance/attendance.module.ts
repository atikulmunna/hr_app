import { Module } from '@nestjs/common';
import { DeviceModule } from '../devices/device.module';
import { EmployeeModule } from '../employees/employee.module';
import { GeofenceModule } from '../geofences/geofence.module';
import { ReviewModule } from '../review/review.module';
import { AbsenceController } from './absence.controller';
import { AbsenceScheduler } from './absence.scheduler';
import { AbsenceService } from './absence.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [EmployeeModule, DeviceModule, GeofenceModule, ReviewModule],
  controllers: [AttendanceController, AbsenceController],
  providers: [AttendanceService, AbsenceService, AbsenceScheduler],
})
export class AttendanceModule {}
