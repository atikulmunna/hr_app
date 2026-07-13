import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

// Minimal actor shape kept in context for audit attribution. Deliberately not
// coupled to the auth module's AuthUser to avoid a dependency cycle.
export interface AuditActor {
  sub?: string;
  username?: string;
}

interface TenantStore {
  tenantId?: string;
  actor?: AuditActor;
}

// Holds the current request's tenant id and actor in async-local storage so any
// service can read them without threading them through every call.
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run(tenantId: string | undefined, callback: () => void): void {
    this.als.run({ tenantId }, callback);
  }

  // Runs async work under a fresh tenant context. Used by background jobs that
  // have no request to inherit a tenant from (e.g. the absence job).
  runWith<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.als.run({ tenantId }, fn);
  }

  get tenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  // Set by the auth guard once the tenant is resolved from the verified token.
  setTenantId(tenantId: string): void {
    const store = this.als.getStore();
    if (store) {
      store.tenantId = tenantId;
    }
  }

  get actor(): AuditActor | undefined {
    return this.als.getStore()?.actor;
  }

  setActor(actor: AuditActor): void {
    const store = this.als.getStore();
    if (store) {
      store.actor = actor;
    }
  }
}
