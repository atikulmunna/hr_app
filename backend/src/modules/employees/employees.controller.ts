import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import { EmployeeBulkService } from './employee-bulk.service';
import {
  CreateEmployeeInput,
  EmployeeService,
  UpdateEmployeeInput,
} from './employee.service';

interface ImportBody {
  csv: string;
}

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly bulk: EmployeeBulkService,
  ) {}

  @RequirePermissions('employee:read')
  @Get()
  list() {
    return this.employees.list();
  }

  // Declared before the :id route so "export" is not matched as an id.
  @RequirePermissions('employee:read')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="employees.csv"')
  export() {
    return this.bulk.exportCsv();
  }

  @RequirePermissions('employee:manage')
  @Post('import')
  import(@Body() body: ImportBody) {
    return this.bulk.importCsv(body?.csv);
  }

  @RequirePermissions('employee:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @RequirePermissions('employee:read')
  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.employees.history(id);
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
