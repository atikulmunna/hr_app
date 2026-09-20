import { Module } from '@nestjs/common';
import { CustomFieldModule } from '../custom-fields/custom-field.module';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { EmployeeBulkService } from './employee-bulk.service';
import { EmployeeService } from './employee.service';
import { EmployeesController } from './employees.controller';
import { ProfileChangeService } from './profile-change.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [CustomFieldModule, LifecycleModule],
  controllers: [EmployeesController, ProfileController],
  providers: [EmployeeService, EmployeeBulkService, ProfileChangeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
