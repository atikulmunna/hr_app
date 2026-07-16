import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { ProfileChangeRequest } from '../../entities/profile-change-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { WorkflowService } from '../workflow/workflow.service';
import { EmployeeService } from './employee.service';

// Name changes are identity-sensitive, so they route to HR (FR-M9-01).
const PROFILE_APPROVER_ROLES = ['hr_admin'];

// Sensitive profile fields an employee may request to change, mapped to their
// employee column. Contact fields are edited directly, not through this flow.
const SENSITIVE_COLUMNS: Record<string, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
};

export interface ProfileChangeInput {
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class ProfileChangeService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly workflow: WorkflowService,
  ) {}

  // Submits a sensitive profile change for HR approval. Nothing changes on the
  // employee record until it is approved (FR-M9-01).
  async request(user: AuthUser, input: ProfileChangeInput) {
    const changes = this.validate(input);
    const employee = await this.employees.myProfile(user.sub, user.email);

    const approval = await this.workflow.createRequest({
      requestType: 'profile_change',
      resourceType: 'employee',
      payload: { employeeId: employee.id, changes },
      approverRoles: PROFILE_APPROVER_ROLES,
    });

    return this.db.withTenant(async (m) => {
      const saved = await m.save(
        m.create(ProfileChangeRequest, {
          tenantId: this.db.tenantId,
          employeeId: employee.id,
          changes,
          createdBy: user.sub,
          approvalRequestId: approval.request.id,
        }),
      );
      await this.audit.record(
        {
          action: 'profile.change_request',
          resourceType: 'profile_change_request',
          resourceId: saved.id,
          after: changes,
        },
        m,
      );
      return saved;
    });
  }

  myRequests(user: AuthUser): Promise<unknown[]> {
    return this.employees
      .myProfile(user.sub, user.email)
      .then((employee) => this.listForEmployee(employee.id));
  }

  // Applies any approved-but-unapplied change for the caller, so a profile read
  // reflects an approval without needing the change-request list to be opened.
  async applyApprovedFor(user: AuthUser): Promise<void> {
    const employee = await this.employees.myProfile(user.sub, user.email);
    await this.db.withTenant((m) => this.syncApproved(m, employee.id));
  }

  async listForEmployee(employeeId: string): Promise<unknown[]> {
    return this.db.withTenant(async (m) => {
      await this.syncApproved(m, employeeId);
      return m.query(
        `SELECT p.id, p.changes,
                p.applied_at AS "appliedAt", p.created_at AS "createdAt",
                COALESCE(ar.status, 'pending') AS "status"
         FROM profile_change_requests p
         LEFT JOIN approval_requests ar ON ar.id = p.approval_request_id
         WHERE p.employee_id = $1
         ORDER BY p.created_at DESC`,
        [employeeId],
      );
    });
  }

  // Applies every approved change request that has not yet been applied, in the
  // caller's transaction. Idempotent (guarded by applied_at), mirroring the
  // regularization/swap apply-once precedent.
  async syncApproved(m: EntityManager, employeeId: string): Promise<void> {
    const pending: ProfileChangeRequest[] = await m
      .createQueryBuilder(ProfileChangeRequest, 'p')
      .innerJoin(
        'approval_requests',
        'ar',
        'ar.id = p.approval_request_id AND ar.status = :approved',
        { approved: 'approved' },
      )
      .where('p.employee_id = :employeeId', { employeeId })
      .andWhere('p.applied_at IS NULL')
      .getMany();

    for (const req of pending) {
      await this.apply(m, req);
    }
  }

  private async apply(
    m: EntityManager,
    req: ProfileChangeRequest,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [field, column] of Object.entries(SENSITIVE_COLUMNS)) {
      const value = req.changes[field];
      if (typeof value === 'string' && value.length > 0) {
        sets.push(`${column} = $${i++}`);
        params.push(value);
      }
    }
    if (sets.length > 0) {
      params.push(req.employeeId);
      await m.query(
        `UPDATE employees SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i}`,
        params,
      );
    }
    req.appliedAt = new Date();
    await m.save(req);
    await this.audit.record(
      {
        action: 'profile.change_apply',
        resourceType: 'profile_change_request',
        resourceId: req.id,
        after: req.changes,
      },
      m,
    );
  }

  private validate(input: ProfileChangeInput): Record<string, string> {
    const changes: Record<string, string> = {};
    for (const field of Object.keys(SENSITIVE_COLUMNS)) {
      const raw = (input as Record<string, unknown>)[field];
      if (raw !== undefined) {
        const value = String(raw).trim();
        if (!value) {
          throw new BadRequestException(`${field} cannot be blank.`);
        }
        changes[field] = value;
      }
    }
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(
        'Provide a first name or last name to change.',
      );
    }
    return changes;
  }
}
