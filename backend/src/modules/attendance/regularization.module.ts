import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { RegularizationController } from './regularization.controller';
import { RegularizationService } from './regularization.service';

// Attendance regularization (T-1C.11). Kept as its own module so it can be
// imported without pulling in the full attendance stack.
@Module({
  imports: [EmployeeModule],
  controllers: [RegularizationController],
  providers: [RegularizationService],
  exports: [RegularizationService],
})
export class RegularizationModule {}
