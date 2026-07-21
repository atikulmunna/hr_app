import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { ApplicationService } from './application.service';
import { OfferService } from './offer.service';
import { RecruitmentController } from './recruitment.controller';
import { RequisitionService } from './requisition.service';
import { StageService } from './stage.service';

// Recruitment / ATS (T-3.1). EmployeeModule supplies EmployeeService, used to
// convert a signed offer into an employee record. Workflow, audit, and
// notification services are global.
@Module({
  imports: [EmployeeModule],
  controllers: [RecruitmentController],
  providers: [
    StageService,
    RequisitionService,
    ApplicationService,
    OfferService,
  ],
})
export class RecruitmentModule {}
