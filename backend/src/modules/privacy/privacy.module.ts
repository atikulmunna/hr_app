import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { DataSubjectController } from './data-subject.controller';
import { DataSubjectService } from './data-subject.service';

// Data-subject requests: export and erasure (T-1F.2).
@Module({
  imports: [EmployeeModule],
  controllers: [DataSubjectController],
  providers: [DataSubjectService],
})
export class PrivacyModule {}
