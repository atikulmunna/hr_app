import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { JobRequisition } from '../../entities/job-requisition.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { WorkflowService } from '../workflow/workflow.service';

// A headcount request is senior sign-off, so it routes to the COO like payroll
// and adjustments, reusing the engine's separation of duties (FR-M5-01,
// FR-M11-01).
const REQUISITION_APPROVER_ROLES = ['tenant_admin'];

export interface CreateRequisitionInput {
  legalEntityId?: string;
  departmentId?: string | null;
  title?: string;
  headcount?: number;
  employmentType?: string;
  description?: string;
  hiringManagerSub?: string;
}

export interface RequisitionView {
  id: string;
  legalEntityId: string;
  legalEntityName: string;
  departmentId: string | null;
  departmentName: string | null;
  title: string;
  headcount: number;
  employmentType: string;
  description: string | null;
  status: string;
  openApplications: number;
  hires: number;
  createdAt: string;
}

// Job requisitions (T-3.1, FR-M5-01). HR drafts a requisition, submits it to the
// COO through the shared workflow, and once approved it accepts applications
// until it is filled or closed.
@Injectable()
export class RequisitionService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  list(): Promise<RequisitionView[]> {
    return this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      return this.views(m, {});
    });
  }

  get(id: string): Promise<RequisitionView> {
    return this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      const [req] = await this.views(m, { id });
      if (!req) {
        throw new NotFoundException('Requisition not found.');
      }
      return req;
    });
  }

  async create(
    user: AuthUser,
    input: CreateRequisitionInput,
  ): Promise<RequisitionView> {
    const title = input.title?.trim();
    if (!input.legalEntityId) {
      throw new BadRequestException('A requisition needs a legal entity.');
    }
    if (!title) {
      throw new BadRequestException('A requisition needs a title.');
    }
    const headcount = input.headcount ?? 1;
    if (!Number.isInteger(headcount) || headcount < 1) {
      throw new BadRequestException('Headcount must be a positive whole number.');
    }
    const id = await this.db.withTenant(async (m) => {
      const entity = await m.findOne(LegalEntity, {
        where: { id: input.legalEntityId },
      });
      if (!entity) {
        throw new BadRequestException('Unknown legal entity.');
      }
      const req = await m.save(
        m.create(JobRequisition, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId,
          departmentId: input.departmentId ?? null,
          title,
          headcount,
          employmentType: input.employmentType?.trim() || 'permanent',
          description: input.description?.trim() || null,
          hiringManagerSub: input.hiringManagerSub ?? null,
          status: 'draft',
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'requisition.create',
          resourceType: 'job_requisition',
          resourceId: req.id,
          after: { title, headcount },
        },
        m,
      );
      return req.id;
    });
    return this.get(id);
  }

  async submit(user: AuthUser, id: string): Promise<RequisitionView> {
    await this.db.withTenant(async (m) => {
      const req = await m.findOne(JobRequisition, { where: { id } });
      if (!req) {
        throw new NotFoundException('Requisition not found.');
      }
      if (req.status !== 'draft') {
        throw new BadRequestException(
          `Only a draft requisition can be submitted (this one is ${req.status}).`,
        );
      }
      const approval = await this.workflow.createRequest({
        requestType: 'requisition',
        resourceType: 'requisition',
        resourceId: req.id,
        payload: {
          title: req.title,
          headcount: req.headcount,
          legalEntityId: req.legalEntityId,
        },
        approverRoles: REQUISITION_APPROVER_ROLES,
      });
      req.status = 'pending';
      req.approvalRequestId = approval.request.id;
      await m.save(req);
      await this.audit.record(
        {
          action: 'requisition.submit',
          resourceType: 'job_requisition',
          resourceId: req.id,
        },
        m,
      );
    });
    return this.get(id);
  }

  async close(id: string): Promise<RequisitionView> {
    await this.db.withTenant(async (m) => {
      const req = await m.findOne(JobRequisition, { where: { id } });
      if (!req) {
        throw new NotFoundException('Requisition not found.');
      }
      if (req.status === 'filled' || req.status === 'closed') {
        throw new BadRequestException(`This requisition is already ${req.status}.`);
      }
      req.status = 'closed';
      await m.save(req);
      await this.audit.record(
        {
          action: 'requisition.close',
          resourceType: 'job_requisition',
          resourceId: req.id,
        },
        m,
      );
    });
    return this.get(id);
  }

  // Marks a requisition filled once its approved headcount is met. Called by the
  // offer flow after a hire converts.
  async markFilledIfComplete(m: EntityManager, requisitionId: string): Promise<void> {
    const req = await m.findOne(JobRequisition, { where: { id: requisitionId } });
    if (!req || req.status !== 'approved') {
      return;
    }
    const [{ hires }] = (await m.query(
      `SELECT count(*)::int AS hires FROM applications
        WHERE requisition_id = $1 AND status = 'hired'`,
      [requisitionId],
    )) as [{ hires: number }];
    if (hires >= req.headcount) {
      req.status = 'filled';
      await m.save(req);
    }
  }

  // The workflow has no post-approval hook, so a decision lands on the next read
  // (same pattern as payroll runs and expense claims).
  async syncApprovals(m: EntityManager): Promise<void> {
    await m.query(`
      UPDATE job_requisitions r
         SET status = 'approved', updated_at = now()
        FROM approval_requests ar
       WHERE ar.id = r.approval_request_id
         AND r.status = 'pending'
         AND ar.status = 'approved'
    `);
    await m.query(`
      UPDATE job_requisitions r
         SET status = 'rejected', updated_at = now()
        FROM approval_requests ar
       WHERE ar.id = r.approval_request_id
         AND r.status = 'pending'
         AND ar.status = 'rejected'
    `);
  }

  private async views(
    m: EntityManager,
    where: { id?: string },
  ): Promise<RequisitionView[]> {
    const params: unknown[] = [];
    let filter = '';
    if (where.id) {
      params.push(where.id);
      filter = `WHERE r.id = $1`;
    }
    return (await m.query(
      `SELECT r.id,
              r.legal_entity_id AS "legalEntityId",
              le.name AS "legalEntityName",
              r.department_id AS "departmentId",
              d.name AS "departmentName",
              r.title,
              r.headcount,
              r.employment_type AS "employmentType",
              r.description,
              r.status,
              (SELECT count(*)::int FROM applications a
                 WHERE a.requisition_id = r.id AND a.status = 'active') AS "openApplications",
              (SELECT count(*)::int FROM applications a
                 WHERE a.requisition_id = r.id AND a.status = 'hired') AS "hires",
              to_char(r.created_at, 'YYYY-MM-DD') AS "createdAt"
         FROM job_requisitions r
         JOIN legal_entities le ON le.id = r.legal_entity_id
         LEFT JOIN departments d ON d.id = r.department_id
         ${filter}
        ORDER BY r.created_at DESC`,
      params,
    )) as RequisitionView[];
  }
}
