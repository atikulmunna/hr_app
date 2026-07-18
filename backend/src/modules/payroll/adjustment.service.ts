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
import { WorkflowService } from '../workflow/workflow.service';

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
  ) {}

  list(legalEntityId?: string): Promise<AdjustmentView[]> {
    return this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      return this.rows(m, legalEntityId ? { legalEntityId } : {});
    });
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

      const approval = await this.workflow.createRequest({
        requestType: 'payroll_adjustment',
        resourceType: 'payroll',
        payload: {
          employeeId: employee.id,
          amount,
          currencyCode: entity.currencyCode,
        },
        approverRoles: ADJUSTMENT_APPROVER_ROLES,
      });

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

  // Reflects approval decisions, like payroll runs: the workflow has no
  // post-approval hook, so a decision lands on the next read. Public so a run
  // materializes approvals before deciding which adjustments to settle, rather
  // than depending on someone having read the adjustment list first.
  async syncApprovals(m: EntityManager): Promise<void> {
    await m.query(`
      UPDATE payroll_adjustments a
         SET status = 'approved', updated_at = now()
        FROM approval_requests ar
       WHERE ar.id = a.approval_request_id
         AND a.status = 'pending'
         AND ar.status = 'approved'
    `);
    await m.query(`
      UPDATE payroll_adjustments a
         SET status = 'rejected', updated_at = now()
        FROM approval_requests ar
       WHERE ar.id = a.approval_request_id
         AND a.status = 'pending'
         AND ar.status = 'rejected'
    `);
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
