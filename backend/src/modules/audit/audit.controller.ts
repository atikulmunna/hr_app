import { Controller, Get, Query } from '@nestjs/common';
import { PageParams, parsePage } from '../../common/pagination';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Recent audit entries for the current tenant. Auditor or HR admin only.
  @RequirePermissions('audit:read')
  @Get()
  list(@Query() query: PageParams) {
    return this.audit.list(parsePage(query));
  }
}
