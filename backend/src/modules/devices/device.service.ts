import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Device } from '../../entities/device.entity';
import { AuditService } from '../audit/audit.service';
import { EmployeeService } from '../employees/employee.service';

export interface DeviceSignals {
  deviceFingerprint?: string;
  platform?: string;
  deviceModel?: string;
}

export interface BindingResult {
  deviceId: string;
  enrolled: boolean;
}

@Injectable()
export class DeviceService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
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

  // Enforces one-active-device binding within the caller's tenant transaction.
  // Auto-enrolls the first device (enrollment grace, O-01); a mark from any
  // other device is hard-blocked until an approved re-bind. Returns the device
  // to stamp on the attendance event.
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
      return { deviceId: device.id, enrolled: true };
    }

    if (active.deviceFingerprint !== fingerprint) {
      throw new BadRequestException(
        'This device is not registered for your account. A device change must be approved by HR.',
      );
    }

    return { deviceId: active.id, enrolled: false };
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
}
