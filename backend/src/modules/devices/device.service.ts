import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { TenantDbService } from '../../database/tenant-db.service';
import { ApprovalRequest } from '../../entities/approval-request.entity';
import {
  DeviceBindingAction,
  DeviceBindingHistory,
  REBIND_REASON_CODES,
} from '../../entities/device-binding-history.entity';
import { Device } from '../../entities/device.entity';
import { AuditService } from '../audit/audit.service';
import { EmployeeService } from '../employees/employee.service';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalView, WorkflowService } from '../workflow/workflow.service';

export interface DeviceSignals {
  deviceFingerprint?: string;
  platform?: string;
  deviceModel?: string;
}

export interface BindingResult {
  deviceId: string;
  enrolled: boolean;
  rebound: boolean;
}

export interface RebindRequestInput {
  reasonCode?: string;
  deviceFingerprint?: string;
  platform?: string;
  deviceModel?: string;
}

// Re-bind approvals default to HR; a tenant may route them to managers later.
const REBIND_APPROVER_ROLES = ['hr_admin'];

// Re-bind abuse detection defaults (FR-DB-07, FR-DB-08). Tenant-configurable
// later (T-1C.12); for now these are the SRS defaults.
const REBIND_COOLOFF_HOURS = 72;
const REBIND_ABUSE_WINDOW_DAYS = 30;
const REBIND_ABUSE_MAX = 2; // escalate when re-binds in the window exceed this

@Injectable()
export class DeviceService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly workflow: WorkflowService,
    private readonly notifications: NotificationService,
    private readonly ctx: TenantContextService,
  ) {}

  listForEmployee(employeeId: string): Promise<Device[]> {
    return this.db.withTenant((m) =>
      m.find(Device, {
        where: { employeeId },
        order: { status: 'ASC', boundAt: 'DESC' },
      }),
    );
  }

  async listMine(
    sub: string | undefined,
    email: string | undefined,
  ): Promise<Device[]> {
    const me = await this.employees.myProfile(sub, email);
    return this.listForEmployee(me.id);
  }

  historyForEmployee(employeeId: string): Promise<DeviceBindingHistory[]> {
    return this.db.withTenant((m) =>
      m.find(DeviceBindingHistory, {
        where: { employeeId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async historyMine(
    sub: string | undefined,
    email: string | undefined,
  ): Promise<DeviceBindingHistory[]> {
    const me = await this.employees.myProfile(sub, email);
    return this.historyForEmployee(me.id);
  }

  // Raises a device-change request for the employee's current device. The app
  // submits the new device's fingerprint; on approval the next mark from that
  // device switches the binding (see enforceBinding). Approver defaults to HR.
  async requestRebind(
    sub: string | undefined,
    email: string | undefined,
    input: RebindRequestInput,
  ): Promise<ApprovalView> {
    const reasonCode = input.reasonCode?.trim();
    if (!reasonCode || !REBIND_REASON_CODES.includes(reasonCode as never)) {
      throw new BadRequestException(
        `reasonCode must be one of: ${REBIND_REASON_CODES.join(', ')}.`,
      );
    }
    const fingerprint = input.deviceFingerprint?.trim();
    if (!fingerprint) {
      throw new BadRequestException(
        'This device could not be identified, so a device change cannot be requested.',
      );
    }

    const me = await this.employees.myProfile(sub, email);

    return this.db.withTenant(async (m) => {
      const active = await m.findOne(Device, {
        where: { employeeId: me.id, status: 'active' },
      });
      if (!active) {
        throw new BadRequestException(
          'You have no registered device yet; your next check-in will register this one.',
        );
      }
      if (active.deviceFingerprint === fingerprint) {
        throw new BadRequestException(
          'This device is already registered for your account.',
        );
      }
      const pending = await this.findPendingRebind(m, me.id, fingerprint);
      if (pending) {
        throw new BadRequestException(
          'A device-change request for this device is already awaiting approval.',
        );
      }
      return this.workflow.createRequest(
        {
          requestType: 'device_rebind',
          resourceType: 'device',
          payload: {
            employeeId: me.id,
            reasonCode,
            newFingerprint: fingerprint,
            platform: input.platform,
            deviceModel: input.deviceModel,
          },
          approverRoles: REBIND_APPROVER_ROLES,
        },
        m,
      );
    });
  }

  // Enforces one-active-device binding within the caller's tenant transaction.
  // Auto-enrolls the first device (enrollment grace, O-01). On a mismatch it
  // applies an approved re-bind if one exists for this device; otherwise the
  // mark is hard-blocked until an approved re-bind. Returns the device to stamp
  // on the attendance event.
  async enforceBinding(
    m: EntityManager,
    employeeId: string,
    signals: DeviceSignals,
  ): Promise<BindingResult> {
    const fingerprint = signals.deviceFingerprint?.trim();
    if (!fingerprint) {
      throw new BadRequestException(
        'This device could not be identified, so attendance cannot be verified.',
      );
    }

    const active = await m.findOne(Device, {
      where: { employeeId, status: 'active' },
    });

    if (!active) {
      const device = await this.enroll(m, employeeId, fingerprint, signals);
      return { deviceId: device.id, enrolled: true, rebound: false };
    }

    if (active.deviceFingerprint === fingerprint) {
      return { deviceId: active.id, enrolled: false, rebound: false };
    }

    // Mismatch: switch the binding only if an approved re-bind authorises this
    // exact device; otherwise hard-block (FR-DB-03).
    const approved = await this.findApprovedRebind(m, employeeId, fingerprint);
    if (approved) {
      const device = await this.applyRebind(
        m,
        active,
        employeeId,
        fingerprint,
        signals,
        approved,
      );
      return { deviceId: device.id, enrolled: false, rebound: true };
    }

    throw new BadRequestException(
      'This device is not registered for your account. A device change must be approved by HR.',
    );
  }

  // True when the employee was re-bound within the cool-off window, so the
  // attendance mark carries the newly-re-bound soft flag (FR-DB-07).
  async wasReboundWithin(
    m: EntityManager,
    employeeId: string,
    hours = REBIND_COOLOFF_HOURS,
  ): Promise<boolean> {
    const count = await this.countRebindsSince(
      m,
      employeeId,
      'make_interval(hours => :window)',
      hours,
    );
    return count > 0;
  }

  private async enroll(
    m: EntityManager,
    employeeId: string,
    fingerprint: string,
    signals: DeviceSignals,
  ): Promise<Device> {
    const device = await m.save(
      m.create(Device, {
        tenantId: this.db.tenantId,
        employeeId,
        deviceFingerprint: fingerprint,
        platform: signals.platform,
        model: signals.deviceModel,
        status: 'active',
      }),
    );
    await this.recordHistory(m, { employeeId, deviceId: device.id, action: 'enroll' });
    await this.audit.record(
      {
        action: 'device.enroll',
        resourceType: 'device',
        resourceId: device.id,
        after: { employeeId, platform: signals.platform },
      },
      m,
    );
    return device;
  }

  // Retires the current device and activates the new one, atomically within the
  // mark transaction, and marks the approval applied so it is used only once.
  private async applyRebind(
    m: EntityManager,
    current: Device,
    employeeId: string,
    fingerprint: string,
    signals: DeviceSignals,
    request: ApprovalRequest,
  ): Promise<Device> {
    const reasonCode = (request.payload as { reasonCode?: string })?.reasonCode;

    current.status = 'retired';
    current.retiredAt = new Date();
    await m.save(current);
    await this.recordHistory(m, {
      employeeId,
      deviceId: current.id,
      action: 'retire',
      requestId: request.id,
    });

    const device = await m.save(
      m.create(Device, {
        tenantId: this.db.tenantId,
        employeeId,
        deviceFingerprint: fingerprint,
        platform: signals.platform,
        model: signals.deviceModel,
        status: 'active',
      }),
    );
    await this.recordHistory(m, {
      employeeId,
      deviceId: device.id,
      action: 'rebind',
      reasonCode,
      requestId: request.id,
    });

    request.payload = {
      ...(request.payload as Record<string, unknown>),
      appliedAt: new Date().toISOString(),
    };
    await m.save(request);

    await this.audit.record(
      {
        action: 'device.rebind',
        resourceType: 'device',
        resourceId: device.id,
        before: { deviceId: current.id },
        after: { deviceId: device.id, reasonCode, requestId: request.id },
      },
      m,
    );

    await this.escalateIfAbusive(m, employeeId, request.id);
    return device;
  }

  // Flags an employee who re-binds too often (FR-DB-08). No case queue exists
  // yet (T-1C.8), so escalation notifies HR and audits; the review case will
  // attach to this signal when the queue lands.
  private async escalateIfAbusive(
    m: EntityManager,
    employeeId: string,
    requestId: string,
  ): Promise<void> {
    const count = await this.countRebindsSince(
      m,
      employeeId,
      'make_interval(days => :window)',
      REBIND_ABUSE_WINDOW_DAYS,
    );
    if (count <= REBIND_ABUSE_MAX) {
      return;
    }
    await this.audit.record(
      {
        action: 'device.rebind_abuse',
        resourceType: 'employee',
        resourceId: employeeId,
        after: { count, windowDays: REBIND_ABUSE_WINDOW_DAYS, requestId },
      },
      m,
    );
    await this.notifications.notify(
      {
        recipientRole: 'hr_admin',
        type: 'device.rebind_abuse',
        title: 'Frequent device changes',
        body: `An employee has changed devices ${count} times in the last ${REBIND_ABUSE_WINDOW_DAYS} days and needs review.`,
        data: { employeeId, count, windowDays: REBIND_ABUSE_WINDOW_DAYS },
      },
      m,
    );
  }

  // Counts rebind history rows since now() minus the given interval expression.
  private countRebindsSince(
    m: EntityManager,
    employeeId: string,
    intervalExpr: string,
    window: number,
  ): Promise<number> {
    return m
      .createQueryBuilder(DeviceBindingHistory, 'h')
      .where('h.employeeId = :employeeId', { employeeId })
      .andWhere('h.action = :action', { action: 'rebind' })
      .andWhere(`h.createdAt >= now() - ${intervalExpr}`, { window })
      .getCount();
  }

  private recordHistory(
    m: EntityManager,
    entry: {
      employeeId: string;
      deviceId: string;
      action: DeviceBindingAction;
      reasonCode?: string;
      requestId?: string;
    },
  ): Promise<DeviceBindingHistory> {
    return m.save(
      m.create(DeviceBindingHistory, {
        tenantId: this.db.tenantId,
        employeeId: entry.employeeId,
        deviceId: entry.deviceId,
        action: entry.action,
        reasonCode: entry.reasonCode,
        requestId: entry.requestId,
        actorSub: this.ctx.actor?.sub,
      }),
    );
  }

  private findPendingRebind(
    m: EntityManager,
    employeeId: string,
    fingerprint: string,
  ): Promise<ApprovalRequest | null> {
    return this.rebindQuery(m, employeeId, fingerprint)
      .andWhere('r.status = :status', { status: 'pending' })
      .getOne();
  }

  private findApprovedRebind(
    m: EntityManager,
    employeeId: string,
    fingerprint: string,
  ): Promise<ApprovalRequest | null> {
    return this.rebindQuery(m, employeeId, fingerprint)
      .andWhere('r.status = :status', { status: 'approved' })
      .andWhere("r.payload->>'appliedAt' IS NULL")
      .orderBy('r.createdAt', 'DESC')
      .getOne();
  }

  private rebindQuery(
    m: EntityManager,
    employeeId: string,
    fingerprint: string,
  ) {
    return m
      .createQueryBuilder(ApprovalRequest, 'r')
      .where('r.requestType = :type', { type: 'device_rebind' })
      .andWhere("r.payload->>'employeeId' = :employeeId", { employeeId })
      .andWhere("r.payload->>'newFingerprint' = :fingerprint", { fingerprint });
  }
}
