import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { PayrollModule } from '../payroll/payroll.module';
import { AppraisalService } from './appraisal.service';
import { CycleService } from './cycle.service';
import { GoalService } from './goal.service';
import { PerformanceController } from './performance.controller';

// Performance management (T-3.2). EmployeeModule supplies EmployeeService (self
// profile, job-title updates on promotion); PayrollModule supplies
// CompensationService, used to apply an increment as a base-pay raise. Workflow,
// audit, and notification services are global.
@Module({
  imports: [EmployeeModule, PayrollModule],
  controllers: [PerformanceController],
  providers: [CycleService, GoalService, AppraisalService],
})
export class PerformanceModule {}
