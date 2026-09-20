import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ApprovalRequest } from '../../entities/approval-request.entity';
import { ApprovalStep } from '../../entities/approval-step.entity';
import { WorkflowService } from './workflow.service';

// A minimal in-memory stand-in for the EntityManager methods the engine uses:
// create/save/findOne/find/count over the two approval tables. It is enough to
// drive the step sequence without a database.
class FakeManager {
  requests: ApprovalRequest[] = [];
  steps: ApprovalStep[] = [];
  private nextId = 1;

  private table(entity: unknown): ApprovalRequest[] | ApprovalStep[] {
    if (entity === ApprovalRequest) return this.requests;
    if (entity === ApprovalStep) return this.steps;
    throw new Error('Unexpected entity in test.');
  }

  create<T>(entity: unknown, data: Partial<T>): T {
    void this.table(entity);
    return { ...data } as T;
  }

  async save<T extends { id?: string }>(row: T): Promise<T> {
    const rows = ('requestType' in row ? this.requests : this.steps) as unknown as T[];
    if (!row.id) {
      row.id = `id-${this.nextId++}`;
      rows.push(row);
    } else if (!rows.includes(row)) {
      const i = rows.findIndex((r) => r.id === row.id);
      rows[i] = row;
    }
    return row;
  }

  async findOne<T>(entity: unknown, opts: { where: Partial<T> }): Promise<T | null> {
    return (this.matches(entity, opts.where)[0] as T) ?? null;
  }

  async find<T>(entity: unknown, opts: { where: Partial<T> }): Promise<T[]> {
    const rows = this.matches(entity, opts.where) as unknown as ApprovalStep[];
    return [...rows].sort((a, b) => a.stepOrder - b.stepOrder) as unknown as T[];
  }

  async count<T>(entity: unknown, opts: { where: Partial<T> }): Promise<number> {
    return this.matches(entity, opts.where).length;
  }

  private matches(entity: unknown, where: object): unknown[] {
    return (this.table(entity) as unknown[]).filter((row) =>
      Object.entries(where).every(
        ([k, v]) => (row as Record<string, unknown>)[k] === v,
      ),
    );
  }
}

interface Actor {
  sub?: string;
  roles: string[];
}

function build(actor: Actor = { sub: 'alice', roles: ['employee'] }) {
  const manager = new FakeManager();
  const db = {
    tenantId: 'tenant-1',
    withTenant: jest.fn((fn: (m: EntityManager) => Promise<unknown>) =>
      fn(manager as unknown as EntityManager),
    ),
  };
  const ctx = { actor: { sub: actor.sub, username: actor.sub, roles: actor.roles } };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new WorkflowService(
    db as never,
    ctx as never,
    audit as never,
    notifications as never,
  );
  return { service, manager, db, audit, notifications };
}

const twoLevel = {
  requestType: 'leave_request',
  resourceType: 'leave',
  approverRoles: ['manager', 'hr_admin'],
};

describe('createRequest', () => {
  it('requires a request type and at least one approver role', async () => {
    const { service } = build();
    await expect(
      service.createRequest({ requestType: '', approverRoles: ['manager'] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createRequest({ requestType: 'leave_request', approverRoles: [] }),
    ).rejects.toThrow('At least one approver role is required.');
  });

  it('creates the request with one pending step per approver role, in order', async () => {
    const { service, manager } = build();
    const view = await service.createRequest(twoLevel);

    expect(view.request).toMatchObject({
      tenantId: 'tenant-1',
      requestType: 'leave_request',
      requesterSub: 'alice',
      status: 'pending',
      currentStep: 1,
      escalatable: false,
    });
    expect(view.steps.map((s) => [s.stepOrder, s.approverRole, s.status])).toEqual([
      [1, 'manager', 'pending'],
      [2, 'hr_admin', 'pending'],
    ]);
    expect(manager.steps.every((s) => s.requestId === view.request.id)).toBe(true);
  });

  it('marks the request escalatable when the requester holds an approver role', async () => {
    const { service } = build({ sub: 'bob', roles: ['manager'] });
    const view = await service.createRequest(twoLevel);
    expect(view.request.escalatable).toBe(true);
  });

  it("joins the caller's transaction when given a manager", async () => {
    const { service, db, manager } = build();
    const outer = manager as unknown as EntityManager;
    await service.createRequest(twoLevel, outer);
    expect(db.withTenant).toHaveBeenCalledWith(expect.any(Function), outer);
  });

  it('audits the creation and notifies the first-level approver role', async () => {
    const { service, audit, notifications } = build();
    const view = await service.createRequest(twoLevel);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'approval.create',
        resourceId: view.request.id,
      }),
      expect.anything(),
    );
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientRole: 'manager', type: 'approval.pending' }),
      expect.anything(),
    );
  });
});

describe('decide', () => {
  async function pending(actor?: Actor) {
    const built = build(actor);
    const view = await built.service.createRequest(twoLevel);
    built.notifications.notify.mockClear();
    built.audit.record.mockClear();
    return { ...built, id: view.request.id };
  }

  it('404s on an unknown request', async () => {
    const { service } = build();
    await expect(
      service.decide('missing', 'approve', { sub: 'm', roles: ['manager'] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses an actor without the current step role', async () => {
    const { service, id } = await pending();
    await expect(
      service.decide(id, 'approve', { sub: 'hr', roles: ['hr_admin'] }),
    ).rejects.toThrow('This step requires the "manager" role.');
  });

  it('refuses the requester even when they hold the approver role', async () => {
    const { service, id } = await pending({ sub: 'bob', roles: ['manager'] });
    await expect(
      service.decide(id, 'approve', { sub: 'bob', roles: ['manager'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('advances to the next level on approval and notifies that role', async () => {
    const { service, id, notifications } = await pending();
    const view = await service.decide(id, 'approve', { sub: 'm1', roles: ['manager'] }, 'ok');

    expect(view.request.status).toBe('pending');
    expect(view.request.currentStep).toBe(2);
    expect(view.steps[0]).toMatchObject({
      status: 'approved',
      decidedBySub: 'm1',
      comment: 'ok',
    });
    expect(view.steps[0].decidedAt).toBeInstanceOf(Date);
    expect(view.steps[1].status).toBe('pending');
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientRole: 'hr_admin', type: 'approval.pending' }),
      expect.anything(),
    );
  });

  it('approves the request once the last step is approved and tells the requester', async () => {
    const { service, id, notifications, audit } = await pending();
    await service.decide(id, 'approve', { sub: 'm1', roles: ['manager'] });
    const view = await service.decide(id, 'approve', { sub: 'hr1', roles: ['hr_admin'] });

    expect(view.request.status).toBe('approved');
    expect(view.steps.map((s) => s.status)).toEqual(['approved', 'approved']);
    expect(notifications.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ recipientSub: 'alice', type: 'approval.approved' }),
      expect.anything(),
    );
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'approval.approve' }),
      expect.anything(),
    );
  });

  it('rejects the whole request at any level and leaves later steps pending', async () => {
    const { service, id, notifications } = await pending();
    const view = await service.decide(id, 'reject', { sub: 'm1', roles: ['manager'] });

    expect(view.request.status).toBe('rejected');
    expect(view.request.currentStep).toBe(1);
    expect(view.steps.map((s) => s.status)).toEqual(['rejected', 'pending']);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientSub: 'alice', type: 'approval.rejected' }),
      expect.anything(),
    );
  });

  it('refuses a second decision on a finalized request', async () => {
    const { service, id } = await pending();
    await service.decide(id, 'reject', { sub: 'm1', roles: ['manager'] });
    await expect(
      service.decide(id, 'approve', { sub: 'm1', roles: ['manager'] }),
    ).rejects.toThrow('Request is already rejected.');
  });

  describe('escalation to the tenant admin', () => {
    it('lets the COO decide an escalatable request', async () => {
      const { service, id } = await pending({ sub: 'bob', roles: ['manager'] });
      const view = await service.decide(id, 'approve', {
        sub: 'coo',
        roles: ['tenant_admin'],
      });
      expect(view.steps[0]).toMatchObject({ status: 'approved', decidedBySub: 'coo' });
    });

    it('keeps the COO out of an ordinary request', async () => {
      const { service, id } = await pending();
      await expect(
        service.decide(id, 'approve', { sub: 'coo', roles: ['tenant_admin'] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still binds the COO to separation of duties', async () => {
      const { service, id } = await pending({ sub: 'coo', roles: ['tenant_admin', 'manager'] });
      await expect(
        service.decide(id, 'approve', { sub: 'coo', roles: ['tenant_admin'] }),
      ).rejects.toThrow('You raised this request');
    });
  });
});

describe('decision handlers', () => {
  async function pending(actor?: Actor) {
    const built = build(actor);
    const view = await built.service.createRequest(twoLevel);
    return { ...built, id: view.request.id };
  }

  it('refuses a second handler for the same request type', () => {
    const { service } = build();
    service.onDecided('leave_request', async () => undefined);
    expect(() => service.onDecided('leave_request', async () => undefined)).toThrow(
      'already registered',
    );
  });

  it('runs the handler only once the request is finalized, in the same transaction', async () => {
    const { service, id, manager } = await pending();
    const handler = jest.fn().mockResolvedValue(undefined);
    service.onDecided('leave_request', handler);

    await service.decide(id, 'approve', { sub: 'm1', roles: ['manager'] });
    expect(handler).not.toHaveBeenCalled();

    await service.decide(id, 'approve', { sub: 'hr1', roles: ['hr_admin'] });
    expect(handler).toHaveBeenCalledTimes(1);
    const [view, m] = handler.mock.calls[0];
    expect(view.request).toMatchObject({ id, status: 'approved' });
    expect(view.steps).toHaveLength(2);
    expect(m).toBe(manager);
  });

  it('runs the handler on rejection too', async () => {
    const { service, id } = await pending();
    const handler = jest.fn().mockResolvedValue(undefined);
    service.onDecided('leave_request', handler);
    await service.decide(id, 'reject', { sub: 'm1', roles: ['manager'] });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ status: 'rejected' }) }),
      expect.anything(),
    );
  });

  it('ignores request types with no handler', async () => {
    const { service, id } = await pending();
    service.onDecided('something_else', jest.fn());
    await expect(
      service.decide(id, 'reject', { sub: 'm1', roles: ['manager'] }),
    ).resolves.toMatchObject({ request: { status: 'rejected' } });
  });

  it('propagates a handler failure so the decision rolls back with it', async () => {
    const { service, id } = await pending();
    service.onDecided('leave_request', async () => {
      throw new Error('roster day no longer exists');
    });
    await expect(
      service.decide(id, 'reject', { sub: 'm1', roles: ['manager'] }),
    ).rejects.toThrow('roster day no longer exists');
  });
});

describe('getRequest', () => {
  const requester = { sub: 'alice', roles: ['employee'] };

  it('returns the request with its ordered steps to its requester', async () => {
    const { service } = build();
    const created = await service.createRequest(twoLevel);
    const view = await service.getRequest(created.request.id, requester);
    expect(view.request.id).toBe(created.request.id);
    expect(view.steps.map((s) => s.stepOrder)).toEqual([1, 2]);
  });

  it('is visible to any of its approver roles and to the tenant admin', async () => {
    const { service } = build();
    const { request } = await service.createRequest(twoLevel);
    for (const roles of [['manager'], ['hr_admin'], ['tenant_admin']]) {
      await expect(
        service.getRequest(request.id, { sub: 'someone', roles }),
      ).resolves.toMatchObject({ request: { id: request.id } });
    }
  });

  it('404s for anyone else, and on an unknown id', async () => {
    const { service } = build();
    const { request } = await service.createRequest(twoLevel);
    await expect(
      service.getRequest(request.id, { sub: 'carol', roles: ['employee'] }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.getRequest(request.id, { sub: 'carol', roles: ['recruiter'] }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.getRequest('nope', requester)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('listPendingForRoles', () => {
  it('short-circuits to an empty list without roles', async () => {
    const { service, manager } = build();
    const spy = jest.spyOn(manager, 'findOne');
    await expect(service.listPendingForRoles([], 'x')).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
