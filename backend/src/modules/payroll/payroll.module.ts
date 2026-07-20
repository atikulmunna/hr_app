import { Module } from '@nestjs/common';
import { OvertimeModule } from '../attendance/overtime.module';
import { EmployeeModule } from '../employees/employee.module';
import { ShiftModule } from '../shifts/shift.module';
import { AdjustmentService } from './adjustment.service';
import { CompensationService } from './compensation.service';
import { ExpenseCategoryService } from './expense-category.service';
import { ExpenseClaimService } from './expense-claim.service';
import { ExpenseController } from './expense.controller';
import { PayComponentService } from './pay-component.service';
import { PayRulesService } from './pay-rules.service';
import { PayrollRunService } from './payroll-run.service';
import { PayrollController } from './payroll.controller';
import { PayslipService } from './payslip.service';
import { StatutoryService } from './statutory.service';

@Module({
  // ShiftModule provides SummaryService: a run pulls its attendance, leave, and
  // overtime intake from the existing summary rather than recomputing it.
  // OvertimeModule provides the approved hours a run is allowed to pay.
  imports: [ShiftModule, OvertimeModule, EmployeeModule],
  controllers: [PayrollController, ExpenseController],
  providers: [
    PayComponentService,
    CompensationService,
    PayrollRunService,
    PayRulesService,
    StatutoryService,
    PayslipService,
    AdjustmentService,
    ExpenseCategoryService,
    ExpenseClaimService,
  ],
  exports: [
    PayComponentService,
    CompensationService,
    PayrollRunService,
    StatutoryService,
    PayslipService,
  ],
})
export class PayrollModule {}
