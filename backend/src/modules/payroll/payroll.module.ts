import { Module } from '@nestjs/common';
import { CompensationService } from './compensation.service';
import { PayComponentService } from './pay-component.service';
import { PayrollController } from './payroll.controller';

@Module({
  controllers: [PayrollController],
  providers: [PayComponentService, CompensationService],
  exports: [PayComponentService, CompensationService],
})
export class PayrollModule {}
