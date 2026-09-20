import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Employee } from '../../entities/employee.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { PayrollAdjustment } from '../../entities/payroll-adjustment.entity';
import { PayrollRun } from '../../entities/payroll-run.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalView, WorkflowService } from '../workflow/workflow.service';

// Approved like a run, so the preparer is not the approver (O-09).
const ADJUSTMENT_APPROVER_ROLES = ['tenant_admin'];

export interface CreateAdjustmentInput {
  employeeId?: string;
  amount?: number;
  reason?: string;
  sourceRunId?: string;
}

export interface AdjustmentView {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  reason: string;
  amount: number;
  currencyCode: string;
  status: string;
  sourceRunId: string | null;
  settledRunId: string | null;
  createdAt: string;
}

// Off-cycle payroll adjustments (T-2.5, FR-M4-11). A signed correction a locked
// run cannot absorb, settled into a later run instead of rewriting the closed
// one (D-09).
@Injectable()
export class AdjustmentService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly notifications: NotificationService,
  ) {
    this.workflow.onDecided('payroll_adjustment', (view, m) =>
      this.onDecided(view, m),
    );
  }

  list(legalEntityId?: string): Promise<AdjustmentView[]> {
    return this.db.withTenant((m) =>
      this.rows(m, legalEntityId ? { legalEntityId } : {}),
    );
  }

  async create(
    input: CreateAdjustmentInput,
    user: AuthUser,
  ): Promise<AdjustmentView> {
    const reason = input.reason?.trim();
    const amount = input.amount;
    if (!input.employeeId) {
      throw new BadRequestException('employeeId is required.');
    }
    if (!reason) {
      throw new BadRequestException('An adjustment needs a reason.');
    }
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount === 0) {
      throw new BadRequestException(
        'amount must be a non-zero number (negative to claw back).',
      );
    }

    const { id, employeeSub } = await this.db.withTenant(async (m) => {
      const employee = await m.findOne(Employee, {
        where: { id: input.employeeId },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }
      const entity = await m.findOne(LegalEntity, {
        where: { id: employee.legalEntityId },
      });
      if (!entity) {
        throw new BadRequestException(
          'This employee has no legal entity, so their pay currency is unknown.',
        );
      }
      // You only adjust off-cycle against a period that is closed. A draft run
      // should be corrected by recomputing it, not by an adjustment.
      if (input.sourceRunId) {
        const source = await m.findOne(PayrollRun, {
          where: { id: input.sourceRunId },
        });
        if (!source) {
          throw new BadRequestException('Unknown source payroll run.');
        }
        if (source.status === 'draft') {
          throw new BadRequestException(
            'That run is still a draft. Recompute it instead of adjusting it.',
          );
        }
        if (source.legalEntityId !== employee.legalEntityId) {
          throw new BadRequestException(
            'The source run belongs to another legal entity.',
          );
        }
      }

      const approval = await this.workflow.createRequest(
        {
          requestType: 'payroll_adjustment',
          resourceType: 'payroll',
          payload: {
            employeeId: employee.id,
            amount,
            currencyCode: entity.currencyCode,
          },
          approverRoles: ADJUSTMENT_APPROVER_ROLES,
        },
        m,
      );

      const adjustment = await m.save(
        m.create(PayrollAdjustment, {
          tenantId: this.db.tenantId,
          legalEntityId: employee.legalEntityId,
          employeeId: employee.id,
          reason,
          amount: amount.toFixed(2),
          currencyCode: entity.currencyCode,
          sourceRunId: input.sourceRunId ?? null,
          status: 'pending',
          approvalRequestId: approval.request.id,
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'payroll_adjustment.create',
          resourceType: 'payroll_adjustment',
          resourceId: adjustment.id,
          after: { employeeId: employee.id, amount, reason },
        },
        m,
      );

      // Notify the employee and payroll administrators in plain language
      // (FR-AT-40).
      const verb = amount >= 0 ? 'an additional payment of' : 'a recovery of';
      const body =
        `A payroll adjustment of ${verb} ${Math.abs(amount).toFixed(2)} ` +
        `${entity.currencyCode} has been raised: ${reason}. It will appear in an ` +
        `upcoming payroll run once approved.`;
      if (employee.keycloakSub) {
        await this.notifications.notify(
          {
            recipientSub: employee.keycloakSub,
            type: 'payroll.adjustment',
            title: 'Payroll adjustment',
            body,
            data: { adjustmentId: adjustment.id },
          },
          m,
        );
      }
      await this.notifications.notify(
        {
          recipientRole: 'hr_admin',
          type: 'payroll.adjustment',
          title: 'Payroll adjustment raised',
          body,
          data: { adjustmentId: adjustment.id, employeeId: employee.id },
        },
        m,
      );
      return { id: adjustment.id, employeeSub: employee.keycloakSub };
    });

    void employeeSub;
    const [created] = await this.db.withTenant((m) =>
      this.rows(m, { id }),
    );
    return created;
  }

  // Raises an adjustment that is already approved, for a claim that carried its
  // own approval (T-2.6 expense settlement via payroll). It skips the workflow
  // because the claim was decided on its own, and lands on the next run through
  // the same approved-and-unsettled pickup as any other adjustment. Runs inside
  // the caller's transaction so the claim and its adjustment commit together.
  async createApproved(
    m: EntityManager,
    input: {
      employeeId: string;
      legalEntityId: string;
      amount: number;
      currencyCode: string;
      reason: string;
      createdBySub?: string;
    },
  ): Promise<string> {
    const adjustment = await m.save(
      m.create(PayrollAdjustment, {
        tenantId: this.db.tenantId,
        legalEntityId: input.legalEntityId,
        employeeId: input.employeeId,
        reason: input.reason,
        amount: input.amount.toFixed(2),
        currencyCode: input.currencyCode,
        status: 'approved',
        createdBySub: input.createdBySub,
      }),
    );
    await this.audit.record(
      {
        action: 'payroll_adjustment.create',
        resourceType: 'payroll_adjustment',
        resourceId: adjustment.id,
        after: {
          employeeId: input.employeeId,
          amount: input.amount,
          reason: input.reason,
          source: 'expense_claim',
        },
      },
      m,
    );
    return adjustment.id;
  }

  async cancel(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const adjustment = await m.findOne(PayrollAdjustment, { where: { id } });
      if (!adjustment) {
        throw new NotFoundException('Adjustment not found.');
      }
      if (adjustment.status === 'settled') {
        throw new BadRequestException(
          'This adjustment has already been paid in a run and cannot be cancelled.',
        );
      }
      adjustment.status = 'cancelled';
      await m.save(adjustment);
      await this.audit.record(
        {
          action: 'payroll_adjustment.cancel',
          resourceType: 'payroll_adjustment',
          resourceId: id,
        },
        m,
      );
    });
  }

  // Reflects the decision on the adjustment, so an approved one is picked up by
  // the next run and a rejected one is never settled.
  private async onDecided(view: ApprovalView, m: EntityManager): Promise<void> {
    await m.update(
      PayrollAdjustment,
      { approvalRequestId: view.request.id, status: 'pending' },
      { status: view.request.status === 'approved' ? 'approved' : 'rejected' },
    );
  }

  private async rows(
    m: EntityManager,
    where: { id?: string; legalEntityId?: string },
  ): Promise<AdjustmentView[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (where.id) {
      params.push(where.id);
      clauses.push(`a.id = $${params.length}`);
    }
    if (where.legalEntityId) {
      params.push(where.legalEntityId);
      clauses.push(`a.legal_entity_id = $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return (await m.query(
      `SELECT a.id,
              a.employee_id AS "employeeId",
              e.employee_code AS "employeeCode",
              e.first_name || ' ' || e.last_name AS "employeeName",
              a.reason,
              a.amount::float AS amount,
              a.currency_code AS "currencyCode",
              a.status,
              a.source_run_id AS "sourceRunId",
              a.settled_run_id AS "settledRunId",
              a.created_at AS "createdAt"
         FROM payroll_adjustments a
         JOIN employees e ON e.id = a.employee_id
         ${filter}
        ORDER BY a.created_at DESC`,
      params,
    )) as AdjustmentView[];
  }
}
