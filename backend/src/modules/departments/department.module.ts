import { Module } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { DepartmentsController } from './departments.controller';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
