import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CreateFieldInput,
  CustomFieldService,
  UpdateFieldInput,
} from './custom-field.service';

// Tenant admin surface for configuring the employee record's custom fields.
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldService) {}

  // Readable by anyone who can read employees, so the console can render forms.
  @RequirePermissions('employee:read')
  @Get()
  list() {
    return this.customFields.list();
  }

  @RequirePermissions('employee:manage')
  @Post()
  create(@Body() body: CreateFieldInput) {
    return this.customFields.createDefinition(body);
  }

  @RequirePermissions('employee:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateFieldInput) {
    return this.customFields.updateDefinition(id, body);
  }
}
