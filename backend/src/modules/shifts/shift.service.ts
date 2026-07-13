import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { EmployeeShift } from '../../entities/employee-shift.entity';
import { Shift } from '../../entities/shift.entity';
import { AuditService } from '../audit/audit.service';

export interface CreateShiftInput {
  name?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  graceMinutes?: number;
  legalEntityId?: string;
}

export type UpdateShiftInput = Partial<
  Omit<CreateShiftInput, 'legalEntityId'>
> & { active?: boolean };

const UPDATABLE_FIELDS: (keyof UpdateShiftInput)[] = [
  'name',
  'startTime',
  'endTime',
  'breakMinutes',
  'graceMinutes',
  'active',
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

@Injectable()
export class ShiftService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<Shift[]> {
    return this.db.withTenant((m) =>
      m.find(Shift, { order: { name: 'ASC' } }),
    );
  }

  async create(input: CreateShiftInput): Promise<Shift> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('A shift needs a name.');
    }
    if (
      !input.startTime ||
      !input.endTime ||
      !TIME_PATTERN.test(input.startTime) ||
      !TIME_PATTERN.test(input.endTime)
    ) {
      throw new BadRequestException('startTime and endTime must be HH:MM.');
    }
    if (input.endTime <= input.startTime) {
      throw new BadRequestException('endTime must be after startTime.');
    }
    return this.db.withTenant(async (m) => {
      const shift = await m.save(
        m.create(Shift, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          name,
          startTime: input.startTime,
          endTime: input.endTime,
          breakMinutes: input.breakMinutes ?? 0,
          graceMinutes: input.graceMinutes ?? 0,
        }),
      );
      await this.audit.record(
        {
          action: 'shift.create',
          resourceType: 'shift',
          resourceId: shift.id,
          after: { name, startTime: shift.startTime, endTime: shift.endTime },
        },
        m,
      );
      return shift;
    });
  }

  async update(id: string, patch: UpdateShiftInput): Promise<Shift> {
    return this.db.withTenant(async (m) => {
      const shift = await m.findOne(Shift, { where: { id } });
      if (!shift) {
        throw new NotFoundException('Shift not found.');
      }
      for (const field of UPDATABLE_FIELDS) {
        if (patch[field] !== undefined) {
          (shift as unknown as Record<string, unknown>)[field] = patch[field];
        }
      }
      if (shift.endTime <= shift.startTime) {
        throw new BadRequestException('endTime must be after startTime.');
      }
      await m.save(shift);
      await this.audit.record(
        {
          action: 'shift.update',
          resourceType: 'shift',
          resourceId: id,
          after: patch,
        },
        m,
      );
      return shift;
    });
  }

  // The shift assigned to an employee, or null when none is assigned.
  getForEmployee(employeeId: string): Promise<Shift | null> {
    return this.db.withTenant((m) => this.assignedShift(m, employeeId));
  }

  assignedShift(m: EntityManager, employeeId: string): Promise<Shift | null> {
    return m
      .createQueryBuilder(Shift, 's')
      .innerJoin(EmployeeShift, 'es', 'es.shift_id = s.id')
      .where('es.employee_id = :employeeId', { employeeId })
      .getOne();
  }

  async assign(employeeId: string, shiftId: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const shift = await m.findOne(Shift, { where: { id: shiftId } });
      if (!shift) {
        throw new NotFoundException('Shift not found.');
      }
      const existing = await m.findOne(EmployeeShift, {
        where: { employeeId },
      });
      if (existing) {
        existing.shiftId = shiftId;
        await m.save(existing);
      } else {
        await m.save(
          m.create(EmployeeShift, {
            tenantId: this.db.tenantId,
            employeeId,
            shiftId,
          }),
        );
      }
      await this.audit.record(
        {
          action: 'shift.assign',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { shiftId },
        },
        m,
      );
    });
  }

  async unassign(employeeId: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const result = await m.delete(EmployeeShift, { employeeId });
      if (result.affected) {
        await this.audit.record(
          {
            action: 'shift.unassign',
            resourceType: 'employee',
            resourceId: employeeId,
          },
          m,
        );
      }
    });
  }
}
