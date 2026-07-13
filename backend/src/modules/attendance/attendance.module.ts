import { Module } from '@nestjs/common';
import { DeviceModule } from '../devices/device.module';
import { EmployeeModule } from '../employees/employee.module';
import { GeofenceModule } from '../geofences/geofence.module';
import { ReviewModule } from '../review/review.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [EmployeeModule, DeviceModule, GeofenceModule, ReviewModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
