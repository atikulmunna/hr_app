import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from './tenant-db.service';

function build(tenantId: string | undefined) {
  const manager = { query: jest.fn().mockResolvedValue(undefined) };
  const dataSource = {
    transaction: jest.fn((fn: (m: EntityManager) => Promise<unknown>) =>
      fn(manager as unknown as EntityManager),
    ),
  };
  const ctx = { tenantId };
  const service = new TenantDbService(dataSource as never, ctx as never);
  return { service, manager, dataSource };
}

describe('TenantDbService.withTenant', () => {
  it('opens a transaction and pins the tenant setting to it', async () => {
    const { service, manager, dataSource } = build('tenant-1');
    const result = await service.withTenant(async (m) => {
      expect(m).toBe(manager);
      return 'done';
    });
    expect(result).toBe('done');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.current_tenant_id', $1, true)"),
      ['tenant-1'],
    );
  });

  it('refuses to run without a tenant in context', async () => {
    const { service, dataSource } = build(undefined);
    await expect(service.withTenant(async () => 'x')).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('joins an existing manager instead of opening a new transaction', async () => {
    const { service, dataSource } = build('tenant-1');
    const outer = { query: jest.fn() } as unknown as EntityManager;
    const result = await service.withTenant(async (m) => {
      expect(m).toBe(outer);
      return 42;
    }, outer);
    expect(result).toBe(42);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('joins an existing manager even when the context has no tenant', async () => {
    const { service } = build(undefined);
    const outer = {} as EntityManager;
    await expect(service.withTenant(async () => 'ok', outer)).resolves.toBe('ok');
  });
});
