import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { Page, pageOf } from '../../common/pagination';
import { TenantDbService } from '../../database/tenant-db.service';
import { AuditLog } from '../../entities/audit-log.entity';

export interface AuditEntry {
  action: string;
  resourceType?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly db: TenantDbService,
    private readonly ctx: TenantContextService,
  ) {}

  // Records an append-only audit entry. Pass an EntityManager to join an
  // existing tenant transaction; otherwise a new tenant-scoped one is opened.
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const actor = this.ctx.actor;
    const write = (m: EntityManager) =>
      m.query(
        `INSERT INTO audit_logs
           (tenant_id, actor_sub, actor_username, action, resource_type, resource_id, "before", "after")
         VALUES (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [
          actor?.sub ?? null,
          actor?.username ?? null,
          entry.action,
          entry.resourceType ?? null,
          entry.resourceId ?? null,
          entry.before === undefined ? null : JSON.stringify(entry.before),
          entry.after === undefined ? null : JSON.stringify(entry.after),
        ],
      );

    if (manager) {
      await write(manager);
      return;
    }
    await this.db.withTenant(async (m) => write(m));
  }

  // Audit entries accumulate for as long as the tenant is active, so this reads
  // a window rather than a fixed most-recent slice: with a total and an offset,
  // the history can actually be walked back through.
  list(page: { limit: number; offset: number }): Promise<Page<AuditLog>> {
    return this.db.withTenant(async (m) => {
      const [items, total] = await m.findAndCount(AuditLog, {
        order: { createdAt: 'DESC' },
        take: page.limit,
        skip: page.offset,
      });
      return pageOf(items, total, page);
    });
  }
}
