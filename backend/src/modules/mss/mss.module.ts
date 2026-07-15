import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employees/employee.module';
import { ShiftModule } from '../shifts/shift.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

// Manager self-service (T-1E.2). Reuses the employee profile and the shift
// summary read model rather than reimplementing attendance classification.
@Module({
  imports: [EmployeeModule, ShiftModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class MssModule {}
