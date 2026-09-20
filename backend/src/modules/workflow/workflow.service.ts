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

// Runs inside the deciding transaction once a request is finalized (approved or
// rejected), so the feature module owning the request applies its effect at
// the moment of decision, atomically with it. A failure rolls the decision back.
export type DecisionHandler = (
  view: ApprovalView,
  manager: EntityManager,
) => Promise<void>;

// The senior backstop (COO). It can decide a request only when self-approval
// would otherwise be structurally possible, i.e. the requester holds the
// approver role, so ordinary requests keep their normal hierarchy and never
// reach this role.
const ESCALATION_ROLE = 'tenant_admin';

// The shared multi-level approval engine. Feature modules (leave, expense,
// requisition, regularization, device re-bind) call createRequest and let the
// engine drive the step sequence; they do not reimplement approvals (FR-M11-01).
@Injectable()
export class WorkflowService {
  private readonly handlers = new Map<string, DecisionHandler>();

  constructor(
    private readonly db: TenantDbService,
    private readonly ctx: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // Registers the effect of a decision for one request type. Each type has one
  // owner, so a second registration is a wiring mistake.
  onDecided(requestType: string, handler: DecisionHandler): void {
    if (this.handlers.has(requestType)) {
      throw new Error(`A decision handler for "${requestType}" is already registered.`);
    }
    this.handlers.set(requestType, handler);
  }

  // Pass the caller's EntityManager to open the request inside their tenant
  // transaction, so the request and the record that references it commit
  // together.
  async createRequest(
    input: CreateApprovalInput,
    manager?: EntityManager,
  ): Promise<ApprovalView> {
    if (!input.requestType) {
      throw new BadRequestException('requestType is required.');
    }
    if (!input.approverRoles || input.approverRoles.length === 0) {
      throw new BadRequestException('At least one approver role is required.');
    }
    // A request is escalatable when its raiser holds one of the approver roles,
    // so they could otherwise have approved their own request. Only these may be
    // escalated to the COO.
    const requesterRoles = this.ctx.actor?.roles ?? [];
    const escalatable = input.approverRoles.some((role) =>
      requesterRoles.includes(role),
    );

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
          escalatable,
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
    }, manager);
  }

  // A request is visible to whoever raised it, to holders of any of its
  // approver roles, and to the tenant admin. Anyone else gets the same 404 as
  // for a request that does not exist, so ids do not leak.
  getRequest(
    id: string,
    actor: { sub?: string; roles: string[] },
  ): Promise<ApprovalView> {
    return this.db.withTenant(async (m) => {
      const view = await this.load(m, id);
      const isRequester =
        !!view.request.requesterSub && view.request.requesterSub === actor.sub;
      const isApprover = view.steps.some((s) =>
        actor.roles.includes(s.approverRole),
      );
      const isAdmin = actor.roles.includes(ESCALATION_ROLE);
      if (!isRequester && !isApprover && !isAdmin) {
        throw new NotFoundException('Approval request not found.');
      }
      return view;
    });
  }

  // Requests whose current step is decidable by one of the caller's roles.
  // The queue excludes the caller's own requests: they cannot decide them
  // (separation of duties), so showing them would only offer an action that is
  // guaranteed to fail.
  listPendingForRoles(
    roles: string[],
    actorSub?: string,
  ): Promise<ApprovalRequest[]> {
    if (roles.length === 0) {
      return Promise.resolve([]);
    }
    return this.db.withTenant((m) => {
      // A user sees a request when their role is its current approver, and the
      // COO additionally sees escalatable requests (the only ones it may act on).
      const canEscalate = roles.includes(ESCALATION_ROLE);
      const query = m
        .createQueryBuilder(ApprovalRequest, 'r')
        .innerJoin(
          ApprovalStep,
          's',
          's.request_id = r.id AND s.step_order = r.current_step',
        )
        .where('r.status = :status', { status: 'pending' })
        .andWhere(
          canEscalate
            ? '(s.approver_role IN (:...roles) OR r.escalatable = true)'
            : 's.approver_role IN (:...roles)',
          { roles },
        );
      if (actorSub) {
        query.andWhere(
          '(r.requester_sub IS NULL OR r.requester_sub <> :actorSub)',
          { actorSub },
        );
      }
      return query.orderBy('r.created_at', 'ASC').getMany();
    });
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
      // Eligible either as the step's normal approver, or, only when the request
      // is escalatable, as the COO backstop (O-09). The COO cannot reach an
      // ordinary request, so the normal hierarchy is unchanged.
      const isNormalApprover = actor.roles.includes(step.approverRole);
      const isEscalationApprover =
        request.escalatable && actor.roles.includes(ESCALATION_ROLE);
      if (!isNormalApprover && !isEscalationApprover) {
        throw new ForbiddenException(
          `This step requires the "${step.approverRole}" role.`,
        );
      }
      // Separation of duties (PR-05): holding the approver role is not enough,
      // the approver must be someone other than whoever raised the request.
      // This binds the COO too: a request the COO raised still needs someone
      // else, so power is not concentrated to a self-approving point.
      if (request.requesterSub && request.requesterSub === actor.sub) {
        throw new ForbiddenException(
          'You raised this request, so you cannot decide it. Someone else must ' +
            'review it.',
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
      const view = await this.load(m, id);
      if (request.status !== 'pending') {
        await this.handlers.get(request.requestType)?.(view, m);
      }
      return view;
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
