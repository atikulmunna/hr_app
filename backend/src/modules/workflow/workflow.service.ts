import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { TenantDbService } from '../../database/tenant-db.service';
import { ApprovalRequest } from '../../entities/approval-request.entity';
import { ApprovalStep } from '../../entities/approval-step.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';

export interface CreateApprovalInput {
  requestType: string;
  resourceType?: string;
  resourceId?: string;
  payload?: unknown;
  // Ordered approver roles, one per approval level.
  approverRoles: string[];
}

export interface ApprovalView {
  request: ApprovalRequest;
  steps: ApprovalStep[];
}

// The shared multi-level approval engine. Feature modules (leave, expense,
// requisition, regularization, device re-bind) call createRequest and let the
// engine drive the step sequence; they do not reimplement approvals (FR-M11-01).
@Injectable()
export class WorkflowService {
  constructor(
    private readonly db: TenantDbService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async createRequest(input: CreateApprovalInput): Promise<ApprovalView> {
    if (!input.requestType) {
      throw new BadRequestException('requestType is required.');
    }
    if (!input.approverRoles || input.approverRoles.length === 0) {
      throw new BadRequestException('At least one approver role is required.');
    }
    return this.db.withTenant(async (m) => {
      const request = await m.save(
        m.create(ApprovalRequest, {
          tenantId: this.db.tenantId,
          requestType: input.requestType,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          requesterSub: this.ctx.actor?.sub,
          status: 'pending',
          currentStep: 1,
          payload: input.payload,
        }),
      );
      let order = 1;
      for (const role of input.approverRoles) {
        await m.save(
          m.create(ApprovalStep, {
            tenantId: this.db.tenantId,
            requestId: request.id,
            stepOrder: order,
            approverRole: role,
            status: 'pending',
          }),
        );
        order += 1;
      }
      await this.audit.record(
        {
          action: 'approval.create',
          resourceType: 'approval_request',
          resourceId: request.id,
          after: { requestType: input.requestType, approverRoles: input.approverRoles },
        },
        m,
      );
      // Notify the first-level approvers that a request awaits them.
      await this.notifications.notify(
        {
          recipientRole: input.approverRoles[0],
          type: 'approval.pending',
          title: 'Approval needed',
          body: `A ${input.requestType} request is awaiting your approval.`,
          data: { requestId: request.id, requestType: input.requestType },
        },
        m,
      );
      return this.load(m, request.id);
    });
  }

  getRequest(id: string): Promise<ApprovalView> {
    return this.db.withTenant((m) => this.load(m, id));
  }

  // Requests whose current step is decidable by one of the caller's roles.
  listPendingForRoles(roles: string[]): Promise<ApprovalRequest[]> {
    if (roles.length === 0) {
      return Promise.resolve([]);
    }
    return this.db.withTenant((m) =>
      m
        .createQueryBuilder(ApprovalRequest, 'r')
        .innerJoin(
          ApprovalStep,
          's',
          's.request_id = r.id AND s.step_order = r.current_step',
        )
        .where('r.status = :status', { status: 'pending' })
        .andWhere('s.approver_role IN (:...roles)', { roles })
        .orderBy('r.created_at', 'ASC')
        .getMany(),
    );
  }

  async decide(
    id: string,
    decision: 'approve' | 'reject',
    actor: { sub?: string; roles: string[] },
    comment?: string,
  ): Promise<ApprovalView> {
    return this.db.withTenant(async (m) => {
      const request = await m.findOne(ApprovalRequest, { where: { id } });
      if (!request) {
        throw new NotFoundException('Approval request not found.');
      }
      if (request.status !== 'pending') {
        throw new BadRequestException(
          `Request is already ${request.status}.`,
        );
      }
      const step = await m.findOne(ApprovalStep, {
        where: { requestId: id, stepOrder: request.currentStep },
      });
      if (!step) {
        throw new NotFoundException('Active approval step not found.');
      }
      if (!actor.roles.includes(step.approverRole)) {
        throw new ForbiddenException(
          `This step requires the "${step.approverRole}" role.`,
        );
      }

      step.status = decision === 'approve' ? 'approved' : 'rejected';
      step.decidedBySub = actor.sub;
      step.decidedAt = new Date();
      step.comment = comment;
      await m.save(step);

      if (decision === 'reject') {
        request.status = 'rejected';
      } else {
        const remaining = await m.count(ApprovalStep, {
          where: { requestId: id, status: 'pending' },
        });
        if (remaining === 0) {
          request.status = 'approved';
        } else {
          request.currentStep += 1;
        }
      }
      await m.save(request);

      await this.audit.record(
        {
          action: `approval.${decision}`,
          resourceType: 'approval_request',
          resourceId: id,
          after: { status: request.status, step: step.stepOrder },
        },
        m,
      );

      if (request.status === 'pending') {
        // Advanced a level: notify the next approvers.
        const nextStep = await m.findOne(ApprovalStep, {
          where: { requestId: id, stepOrder: request.currentStep },
        });
        if (nextStep) {
          await this.notifications.notify(
            {
              recipientRole: nextStep.approverRole,
              type: 'approval.pending',
              title: 'Approval needed',
              body: `A ${request.requestType} request is awaiting your approval.`,
              data: { requestId: id, requestType: request.requestType },
            },
            m,
          );
        }
      } else if (request.requesterSub) {
        // Finalized: notify the requester of the outcome.
        await this.notifications.notify(
          {
            recipientSub: request.requesterSub,
            type: `approval.${request.status}`,
            title: `Request ${request.status}`,
            body: `Your ${request.requestType} request was ${request.status}.`,
            data: { requestId: id, requestType: request.requestType },
          },
          m,
        );
      }
      return this.load(m, id);
    });
  }

  private async load(m: EntityManager, id: string): Promise<ApprovalView> {
    const request = await m.findOne(ApprovalRequest, { where: { id } });
    if (!request) {
      throw new NotFoundException('Approval request not found.');
    }
    const steps = await m.find(ApprovalStep, {
      where: { requestId: id },
      order: { stepOrder: 'ASC' },
    });
    return { request, steps };
  }
}
