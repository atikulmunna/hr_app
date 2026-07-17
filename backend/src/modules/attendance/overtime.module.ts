import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { ShiftModule } from '../shifts/shift.module';
import { OvertimeController } from './overtime.controller';
import { OvertimeService } from './overtime.service';

// Approval-gated payable overtime (FR-M2-06). Depends on ShiftModule for the
// summary, which is what derives the hours a claim is checked against.
@Module({
  imports: [EmployeeModule, ShiftModule],
  controllers: [OvertimeController],
  providers: [OvertimeService],
  exports: [OvertimeService],
})
export class OvertimeModule {}
