import { Module } from '@nestjs/common';
import { RegularizationModule } from '../attendance/regularization.module';
import { EmployeeModule } from '../employees/employee.module';
import { ShiftService } from './shift.service';
import { ShiftsController } from './shifts.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [EmployeeModule, RegularizationModule],
  controllers: [ShiftsController],
  providers: [ShiftService, SummaryService],
  exports: [ShiftService, SummaryService],
})
export class ShiftModule {}
