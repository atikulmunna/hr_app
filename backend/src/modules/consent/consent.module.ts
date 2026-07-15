import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

// Consent capture and purpose statements (T-1F.1). Exports ConsentService so
// the attendance mark flow can gate on an active consent.
@Module({
  imports: [EmployeeModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
