import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CreateLegalEntityInput,
  EntitiesService,
} from './entities.service';

// Tenant is resolved from the caller's token by the auth guard.
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @RequirePermissions('entity:read')
  @Get()
  list() {
    return this.entities.list();
  }

  @RequirePermissions('entity:manage')
  @Post()
  create(@Body() body: CreateLegalEntityInput) {
    return this.entities.create(body);
  }
}
