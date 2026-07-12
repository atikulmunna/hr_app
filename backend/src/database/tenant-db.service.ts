import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContextService } from '../common/tenant/tenant-context.service';

// Runs tenant-scoped work inside a transaction with app.current_tenant_id set,
// so Postgres row-level security isolates the current tenant's rows.
@Injectable()
export class TenantDbService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ctx: TenantContextService,
  ) {}

  get tenantId(): string | undefined {
    return this.ctx.tenantId;
  }

  async withTenant<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const tenantId = this.ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException(
        'No tenant in context. The x-tenant-id header is required for tenant-scoped queries.',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      // is_local = true scopes the setting to this transaction only.
      await manager.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
        tenantId,
      ]);
      return fn(manager);
    });
  }
}
