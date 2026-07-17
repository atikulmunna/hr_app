import { Module } from '@nestjs/common';
import { OvertimeModule } from '../attendance/overtime.module';
import { ShiftModule } from '../shifts/shift.module';
import { CompensationService } from './compensation.service';
import { PayComponentService } from './pay-component.service';
import { PayRulesService } from './pay-rules.service';
import { PayrollRunService } from './payroll-run.service';
import { PayrollController } from './payroll.controller';
import { StatutoryService } from './statutory.service';

@Module({
  // ShiftModule provides SummaryService: a run pulls its attendance, leave, and
  // overtime intake from the existing summary rather than recomputing it.
  // OvertimeModule provides the approved hours a run is allowed to pay.
  imports: [ShiftModule, OvertimeModule],
  controllers: [PayrollController],
  providers: [
    PayComponentService,
    CompensationService,
    PayrollRunService,
    PayRulesService,
    StatutoryService,
  ],
  exports: [
    PayComponentService,
    CompensationService,
    PayrollRunService,
    StatutoryService,
  ],
})
export class PayrollModule {}
