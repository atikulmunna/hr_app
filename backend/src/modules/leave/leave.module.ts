import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { LeaveRequestController } from './leave-request.controller';
import { LeaveRequestService } from './leave-request.service';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [EmployeeModule],
  controllers: [LeaveController, LeaveRequestController],
  providers: [LeaveService, LeaveRequestService],
  exports: [LeaveService, LeaveRequestService],
})
export class LeaveModule {}
