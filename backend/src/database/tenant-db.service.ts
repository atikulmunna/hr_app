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

  // Pass an EntityManager to join a tenant transaction that is already open
  // (for example when one service composes another), so the whole operation
  // commits or rolls back as one. Without it a new transaction is opened.
  async withTenant<T>(
    fn: (manager: EntityManager) => Promise<T>,
    manager?: EntityManager,
  ): Promise<T> {
    if (manager) {
      return fn(manager);
    }
    const tenantId = this.ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException(
        'No tenant in context. A bearer token for a tenant realm is required.',
      );
    }
    return this.dataSource.transaction(async (m) => {
      // is_local = true scopes the setting to this transaction only.
      await m.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
        tenantId,
      ]);
      return fn(m);
    });
  }
}
