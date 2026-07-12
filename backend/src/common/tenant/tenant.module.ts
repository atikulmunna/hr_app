import { Global, Module } from '@nestjs/common';
import { TenantDbService } from '../../database/tenant-db.service';
import { TenantContextService } from './tenant-context.service';

// Global so any feature module can inject the tenant context and the
// tenant-scoped database helper without re-importing.
@Global()
@Module({
  providers: [TenantContextService, TenantDbService],
  exports: [TenantContextService, TenantDbService],
})
export class TenantModule {}
