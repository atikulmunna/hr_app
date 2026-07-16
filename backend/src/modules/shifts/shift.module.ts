import { Module } from '@nestjs/common';
import { RegularizationModule } from '../attendance/regularization.module';
import { EmployeeModule } from '../employees/employee.module';
import { RosterService } from './roster.service';
import { ShiftService } from './shift.service';
import { ShiftsController } from './shifts.controller';
import { SummaryService } from './summary.service';
import { SwapService } from './swap.service';

@Module({
  imports: [EmployeeModule, RegularizationModule],
  controllers: [ShiftsController],
  providers: [ShiftService, SummaryService, RosterService, SwapService],
  exports: [ShiftService, SummaryService, RosterService, SwapService],
})
export class ShiftModule {}
