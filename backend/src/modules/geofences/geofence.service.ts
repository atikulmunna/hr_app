import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { EmployeeGeofence } from '../../entities/employee-geofence.entity';
import { Geofence } from '../../entities/geofence.entity';
import { AuditService } from '../audit/audit.service';

export interface CreateGeofenceInput {
  name?: string;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
  legalEntityId?: string;
}

@Injectable()
export class GeofenceService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<Geofence[]> {
    return this.db.withTenant((m) =>
      m.find(Geofence, { order: { createdAt: 'DESC' } }),
    );
  }

  async create(input: CreateGeofenceInput): Promise<Geofence> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('A geofence name is required.');
    }
    if (
      typeof input.latitude !== 'number' ||
      typeof input.longitude !== 'number'
    ) {
      throw new BadRequestException('latitude and longitude are required.');
    }
    if (input.radiusM != null && input.radiusM <= 0) {
      throw new BadRequestException('radiusM must be greater than zero.');
    }
    return this.db.withTenant(async (m) => {
      const fence = await m.save(
        m.create(Geofence, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          name,
          latitude: input.latitude,
          longitude: input.longitude,
          radiusM: input.radiusM ?? 200,
        }),
      );
      await this.audit.record(
        {
          action: 'geofence.create',
          resourceType: 'geofence',
          resourceId: fence.id,
          after: { name, radiusM: fence.radiusM },
        },
        m,
      );
      return fence;
    });
  }

  async setActive(id: string, active: boolean): Promise<Geofence> {
    return this.db.withTenant(async (m) => {
      const fence = await m.findOne(Geofence, { where: { id } });
      if (!fence) {
        throw new NotFoundException('Geofence not found.');
      }
      fence.active = active;
      await m.save(fence);
      await this.audit.record(
        {
          action: 'geofence.set_active',
          resourceType: 'geofence',
          resourceId: id,
          after: { active },
        },
        m,
      );
      return fence;
    });
  }

  // The geofences assigned to an employee (their set), active or not.
  listForEmployee(employeeId: string): Promise<Geofence[]> {
    return this.db.withTenant((m) =>
      m
        .createQueryBuilder(Geofence, 'g')
        .innerJoin(EmployeeGeofence, 'eg', 'eg.geofenceId = g.id')
        .where('eg.employeeId = :employeeId', { employeeId })
        .orderBy('g.name', 'ASC')
        .getMany(),
    );
  }

  async assign(employeeId: string, geofenceId: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const fence = await m.findOne(Geofence, { where: { id: geofenceId } });
      if (!fence) {
        throw new NotFoundException('Geofence not found.');
      }
      const existing = await m.findOne(EmployeeGeofence, {
        where: { employeeId, geofenceId },
      });
      if (existing) {
        return;
      }
      await m.save(
        m.create(EmployeeGeofence, {
          tenantId: this.db.tenantId,
          employeeId,
          geofenceId,
        }),
      );
      await this.audit.record(
        {
          action: 'geofence.assign',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { geofenceId },
        },
        m,
      );
    });
  }

  async unassign(employeeId: string, geofenceId: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const result = await m.delete(EmployeeGeofence, {
        employeeId,
        geofenceId,
      });
      if (result.affected) {
        await this.audit.record(
          {
            action: 'geofence.unassign',
            resourceType: 'employee',
            resourceId: employeeId,
            after: { geofenceId },
          },
          m,
        );
      }
    });
  }

  // The employee's effective geofence set for a mark, evaluated in the caller's
  // tenant transaction: their assigned active fences, or all active tenant
  // fences when none are assigned (FR-AT-28). Assignment narrows and overrides
  // the tenant-wide default to a specific set for that employee.
  async effectiveFences(
    m: EntityManager,
    employeeId: string,
  ): Promise<Geofence[]> {
    const assigned = await m
      .createQueryBuilder(Geofence, 'g')
      .innerJoin(EmployeeGeofence, 'eg', 'eg.geofenceId = g.id')
      .where('eg.employeeId = :employeeId', { employeeId })
      .andWhere('g.active = true')
      .getMany();
    if (assigned.length > 0) {
      return assigned;
    }
    return m.find(Geofence, { where: { active: true } });
  }
}
