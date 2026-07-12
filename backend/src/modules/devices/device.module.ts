import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { DeviceService } from './device.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [EmployeeModule],
  controllers: [DevicesController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
