import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module';
import { DeviceModule } from '../devices/device.module';
import { EmployeeModule } from '../employees/employee.module';
import { GeofenceModule } from '../geofences/geofence.module';
import { ReviewModule } from '../review/review.module';
import { AbsenceController } from './absence.controller';
import { AbsenceScheduler } from './absence.scheduler';
import { AbsenceService } from './absence.service';
import { AttendanceConfigController } from './attendance-config.controller';
import { AttendanceConfigService } from './attendance-config.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [
    EmployeeModule,
    DeviceModule,
    GeofenceModule,
    ReviewModule,
    ConsentModule,
  ],
  controllers: [
    AttendanceController,
    AbsenceController,
    AttendanceConfigController,
  ],
  providers: [
    AttendanceService,
    AbsenceService,
    AbsenceScheduler,
    AttendanceConfigService,
  ],
})
export class AttendanceModule {}
