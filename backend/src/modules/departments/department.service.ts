import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../database/tenant-db.service';
import { Department } from '../../entities/department.entity';
import { AuditService } from '../audit/audit.service';

export interface CreateDepartmentInput {
  legalEntityId: string;
  name: string;
  costCenter?: string;
}

@Injectable()
export class DepartmentService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<Department[]> {
    return this.db.withTenant((m) =>
      m.find(Department, { order: { name: 'ASC' } }),
    );
  }

  create(input: CreateDepartmentInput): Promise<Department> {
    if (!input?.legalEntityId || !input?.name) {
      throw new BadRequestException('legalEntityId and name are required.');
    }
    return this.db.withTenant(async (m) => {
      const dept = await m.save(
        m.create(Department, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          name: input.name,
          costCenter: input.costCenter,
        }),
      );
      await this.audit.record(
        {
          action: 'department.create',
          resourceType: 'department',
          resourceId: dept.id,
          after: dept,
        },
        m,
      );
      return dept;
    });
  }
}
