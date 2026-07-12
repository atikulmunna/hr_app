import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  Employee,
  EmploymentType,
} from '../../entities/employee.entity';
import { AuditService } from '../audit/audit.service';
import { CustomFieldService } from '../custom-fields/custom-field.service';

export interface CreateEmployeeInput {
  legalEntityId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  employmentType?: EmploymentType;
  departmentId?: string;
  managerId?: string;
  hireDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  customFields?: Record<string, unknown>;
}

export type UpdateEmployeeInput = Partial<
  Omit<CreateEmployeeInput, 'employeeCode' | 'legalEntityId'>
> & {
  status?: Employee['status'];
};

const UPDATABLE_FIELDS: (keyof UpdateEmployeeInput)[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'employmentType',
  'departmentId',
  'managerId',
  'hireDate',
  'emergencyContactName',
  'emergencyContactPhone',
  'status',
];

@Injectable()
export class EmployeeService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly customFields: CustomFieldService,
  ) {}

  list(): Promise<Employee[]> {
    return this.db.withTenant((m) =>
      m.find(Employee, { order: { employeeCode: 'ASC' } }),
    );
  }

  get(id: string): Promise<Employee> {
    return this.db.withTenant((m) => this.findOrThrow(m, id));
  }

  create(input: CreateEmployeeInput): Promise<Employee> {
    if (
      !input?.legalEntityId ||
      !input?.employeeCode ||
      !input?.firstName ||
      !input?.lastName
    ) {
      throw new BadRequestException(
        'legalEntityId, employeeCode, firstName, and lastName are required.',
      );
    }
    return this.db.withTenant(async (m) => {
      const customFields = await this.customFields.resolveForEmployee(
        m,
        input.customFields,
      );
      const employee = await m.save(
        m.create(Employee, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          employeeCode: input.employeeCode,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          jobTitle: input.jobTitle,
          employmentType: input.employmentType ?? 'permanent',
          departmentId: input.departmentId,
          managerId: input.managerId,
          hireDate: input.hireDate,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          customFields,
        }),
      );
      await this.audit.record(
        {
          action: 'employee.create',
          resourceType: 'employee',
          resourceId: employee.id,
          after: employee,
        },
        m,
      );
      return employee;
    });
  }

  update(id: string, patch: UpdateEmployeeInput): Promise<Employee> {
    return this.db.withTenant(async (m) => {
      const current = await this.findOrThrow(m, id);
      const before = { ...current };
      for (const field of UPDATABLE_FIELDS) {
        if (patch[field] !== undefined) {
          (current as unknown as Record<string, unknown>)[field] =
            patch[field];
        }
      }
      if (patch.customFields !== undefined) {
        current.customFields = await this.customFields.resolveForEmployee(
          m,
          patch.customFields,
          before.customFields ?? {},
        );
      }
      const after = await m.save(current);
      await this.audit.record(
        {
          action: 'employee.update',
          resourceType: 'employee',
          resourceId: id,
          before,
          after,
        },
        m,
      );
      return after;
    });
  }

  // The caller's own profile. Links the Keycloak identity to the employee by
  // email on first access, then by keycloak_sub thereafter.
  myProfile(sub: string | undefined, email: string | undefined): Promise<Employee> {
    return this.db.withTenant(async (m) => {
      if (sub) {
        const bySub = await m.findOne(Employee, {
          where: { keycloakSub: sub },
        });
        if (bySub) {
          return bySub;
        }
      }
      if (email) {
        const byEmail = await m.findOne(Employee, { where: { email } });
        if (byEmail) {
          if (sub && !byEmail.keycloakSub) {
            await m.update(Employee, { id: byEmail.id }, { keycloakSub: sub });
            byEmail.keycloakSub = sub;
          }
          return byEmail;
        }
      }
      throw new NotFoundException('No employee profile linked to this account.');
    });
  }

  private async findOrThrow(m: EntityManager, id: string): Promise<Employee> {
    const employee = await m.findOne(Employee, { where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    return employee;
  }
}
