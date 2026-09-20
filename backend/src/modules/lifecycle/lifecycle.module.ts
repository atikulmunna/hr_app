import { Module } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { LifecycleController } from './lifecycle.controller';
import { OrgChartService } from './org-chart.service';

// Employee lifecycle (T-3.4b). Reads employees directly and relies on the
// global audit and notification services, so it imports nothing; EmployeeModule
// imports it to open checklists on hire and termination.
@Module({
  controllers: [LifecycleController],
  providers: [OrgChartService, ChecklistService],
  exports: [ChecklistService],
})
export class LifecycleModule {}
