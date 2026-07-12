import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CreateEmployeeInput,
  EmployeeService,
  UpdateEmployeeInput,
} from './employee.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeeService) {}

  @RequirePermissions('employee:read')
  @Get()
  list() {
    return this.employees.list();
  }

  @RequirePermissions('employee:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @RequirePermissions('employee:manage')
  @Post()
  create(@Body() body: CreateEmployeeInput) {
    return this.employees.create(body);
  }

  @RequirePermissions('employee:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateEmployeeInput) {
    return this.employees.update(id, body);
  }
}
