import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantDbService } from '../../database/tenant-db.service';
import { Holiday } from '../../entities/holiday.entity';
import { LeaveType } from '../../entities/leave-type.entity';
import { AuditService } from '../audit/audit.service';

export interface CreateLeaveTypeInput {
  code?: string;
  name?: string;
  legalEntityId?: string;
  annualQuota?: number;
  carryForwardCap?: number;
  noticeDays?: number;
  paid?: boolean;
  encashable?: boolean;
}

export type UpdateLeaveTypeInput = Partial<
  Omit<CreateLeaveTypeInput, 'code' | 'legalEntityId'>
> & { active?: boolean };

const UPDATABLE_TYPE_FIELDS: (keyof UpdateLeaveTypeInput)[] = [
  'name',
  'annualQuota',
  'carryForwardCap',
  'noticeDays',
  'paid',
  'encashable',
  'active',
];

export interface CreateHolidayInput {
  holidayDate?: string;
  name?: string;
  legalEntityId?: string;
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  listTypes(activeOnly = false): Promise<LeaveType[]> {
    return this.db.withTenant((m) =>
      m.find(LeaveType, {
        where: activeOnly ? { active: true } : {},
        order: { name: 'ASC' },
      }),
    );
  }

  async createType(input: CreateLeaveTypeInput): Promise<LeaveType> {
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException('A leave type needs a code and a name.');
    }
    return this.db.withTenant(async (m) => {
      const type = await m.save(
        m.create(LeaveType, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          code,
          name,
          annualQuota: input.annualQuota ?? 0,
          carryForwardCap: input.carryForwardCap ?? 0,
          noticeDays: input.noticeDays ?? 0,
          paid: input.paid ?? true,
          encashable: input.encashable ?? false,
        }),
      );
      await this.audit.record(
        {
          action: 'leave_type.create',
          resourceType: 'leave_type',
          resourceId: type.id,
          after: { code, name, annualQuota: type.annualQuota },
        },
        m,
      );
      return type;
    });
  }

  async updateType(
    id: string,
    patch: UpdateLeaveTypeInput,
  ): Promise<LeaveType> {
    return this.db.withTenant(async (m) => {
      const type = await m.findOne(LeaveType, { where: { id } });
      if (!type) {
        throw new NotFoundException('Leave type not found.');
      }
      for (const field of UPDATABLE_TYPE_FIELDS) {
        if (patch[field] !== undefined) {
          (type as unknown as Record<string, unknown>)[field] = patch[field];
        }
      }
      await m.save(type);
      await this.audit.record(
        {
          action: 'leave_type.update',
          resourceType: 'leave_type',
          resourceId: id,
          after: patch,
        },
        m,
      );
      return type;
    });
  }

  listHolidays(): Promise<Holiday[]> {
    return this.db.withTenant((m) =>
      m.find(Holiday, { order: { holidayDate: 'ASC' } }),
    );
  }

  async createHoliday(input: CreateHolidayInput): Promise<Holiday> {
    const name = input.name?.trim();
    if (!name || !input.holidayDate) {
      throw new BadRequestException('A holiday needs a date and a name.');
    }
    if (Number.isNaN(Date.parse(input.holidayDate))) {
      throw new BadRequestException('holidayDate must be a valid date.');
    }
    return this.db.withTenant(async (m) => {
      const holiday = await m.save(
        m.create(Holiday, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          holidayDate: input.holidayDate,
          name,
        }),
      );
      await this.audit.record(
        {
          action: 'holiday.create',
          resourceType: 'holiday',
          resourceId: holiday.id,
          after: { holidayDate: input.holidayDate, name },
        },
        m,
      );
      return holiday;
    });
  }

  async deleteHoliday(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const result = await m.delete(Holiday, { id });
      if (!result.affected) {
        throw new NotFoundException('Holiday not found.');
      }
      await this.audit.record(
        {
          action: 'holiday.delete',
          resourceType: 'holiday',
          resourceId: id,
        },
        m,
      );
    });
  }
}
