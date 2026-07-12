import { Module } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { EmployeesController } from './employees.controller';
import { ProfileController } from './profile.controller';

@Module({
  controllers: [EmployeesController, ProfileController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
