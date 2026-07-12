import { Module } from '@nestjs/common';
import { CustomFieldModule } from '../custom-fields/custom-field.module';
import { EmployeeService } from './employee.service';
import { EmployeesController } from './employees.controller';
import { ProfileController } from './profile.controller';

@Module({
  imports: [CustomFieldModule],
  controllers: [EmployeesController, ProfileController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
