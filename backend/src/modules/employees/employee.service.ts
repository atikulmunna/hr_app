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
import {
  EmploymentChangeType,
  EmploymentHistory,
} from '../../entities/employment-history.entity';
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
  remoteAllowed?: boolean;
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
  'remoteAllowed',
];

// Classifies an employment change for the timeline, or null when only
// non-employment fields (name, contact) changed. Status takes precedence, then
// a department or manager move (transfer), then a job or type change.
function deriveEmploymentChange(
  before: Employee,
  after: Employee,
): EmploymentChangeType | null {
  if (before.status !== after.status) {
    return 'status_change';
  }
  if (
    before.departmentId !== after.departmentId ||
    before.managerId !== after.managerId
  ) {
    return 'transfer';
  }
  if (
    before.jobTitle !== after.jobTitle ||
    before.employmentType !== after.employmentType
  ) {
    return 'role_change';
  }
  return null;
}

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

  findByCode(code: string): Promise<Employee | null> {
    return this.db.withTenant((m) =>
      m.findOne(Employee, { where: { employeeCode: code } }),
    );
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
      await this.recordHistory(m, employee, 'hired');
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
      const change = deriveEmploymentChange(before, after);
      if (change) {
        await this.recordHistory(m, after, change);
      }
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

  history(employeeId: string): Promise<EmploymentHistory[]> {
    return this.db.withTenant((m) =>
      m.find(EmploymentHistory, {
        where: { employeeId },
        order: { effectiveDate: 'DESC', createdAt: 'DESC' },
      }),
    );
  }

  async myHistory(
    sub: string | undefined,
    email: string | undefined,
  ): Promise<EmploymentHistory[]> {
    const me = await this.myProfile(sub, email);
    return this.history(me.id);
  }

  // Appends a timeline entry capturing the employee's state as of this change.
  private recordHistory(
    m: EntityManager,
    employee: Employee,
    changeType: EmploymentChangeType,
  ): Promise<EmploymentHistory> {
    return m.save(
      m.create(EmploymentHistory, {
        tenantId: this.db.tenantId,
        employeeId: employee.id,
        changeType,
        departmentId: employee.departmentId,
        managerId: employee.managerId,
        jobTitle: employee.jobTitle,
        employmentType: employee.employmentType,
        status: employee.status,
      }),
    );
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
