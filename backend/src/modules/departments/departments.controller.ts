import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CreateDepartmentInput,
  DepartmentService,
} from './department.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentService) {}

  @RequirePermissions('org:read')
  @Get()
  list() {
    return this.departments.list();
  }

  @RequirePermissions('org:manage')
  @Post()
  create(@Body() body: CreateDepartmentInput) {
    return this.departments.create(body);
  }
}
