import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Employee } from '../../entities/employee.entity';
import { ExpenseCategory } from '../../entities/expense-category.entity';
import { ExpenseClaimLine } from '../../entities/expense-claim-line.entity';
import {
  ExpenseClaim,
  ExpenseSettlementMethod,
} from '../../entities/expense-claim.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { NotificationService } from '../notifications/notification.service';
import { WorkflowService } from '../workflow/workflow.service';
import { AdjustmentService } from './adjustment.service';

// Employee-submitted, so it routes to the manager like leave and overtime; the
// engine's separation-of-duties and escalation are reused unchanged (O-09).
const EXPENSE_APPROVER_ROLES = ['manager'];

// A receipt lives inline in the row, so cap it to keep the table sane. Five MB
// covers a phone photo or a scanned PDF.
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export interface ReceiptInput {
  filename?: string;
  mime?: string;
  dataBase64?: string;
}

export interface AddLineInput {
  categoryId?: string;
  expenseDate?: string;
  description?: string;
  amount?: number;
  receipt?: ReceiptInput;
}

export interface ClaimLineView {
  id: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  expenseDate: string;
  description: string;
  amount: number;
  hasReceipt: boolean;
  receiptFilename: string | null;
}

export interface ClaimView {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  title: string;
  currencyCode: string;
  status: string;
  total: number;
  settlementMethod: string | null;
  settledAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  lines: ClaimLineView[];
}

export interface ReceiptFile {
  filename: string;
  mime: string;
  bytes: Buffer;
}

// Expense claims (T-2.6, FR-M8-01 to FR-M8-03). An employee builds a draft of
// lines, each in a category with an optional cap, submits it to their manager
// through the shared workflow, and once approved HR settles it via payroll or
// disbursement.
@Injectable()
export class ExpenseClaimService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly workflow: WorkflowService,
    private readonly notifications: NotificationService,
    private readonly adjustments: AdjustmentService,
  ) {}

  // --- Employee self-service.

  async mine(user: AuthUser): Promise<ClaimView[]> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      return this.claimViews(m, { employeeId: me.id });
    });
  }

  async create(user: AuthUser, title?: string): Promise<ClaimView> {
    const trimmed = title?.trim();
    if (!trimmed) {
      throw new BadRequestException('A claim needs a title.');
    }
    const me = await this.employees.myProfile(user.sub, user.email);
    const id = await this.db.withTenant(async (m) => {
      const entity = await m.findOne(LegalEntity, {
        where: { id: me.legalEntityId },
      });
      if (!entity) {
        throw new BadRequestException(
          'Your legal entity is unknown, so the claim currency cannot be set.',
        );
      }
      const claim = await m.save(
        m.create(ExpenseClaim, {
          tenantId: this.db.tenantId,
          legalEntityId: me.legalEntityId,
          employeeId: me.id,
          title: trimmed,
          currencyCode: entity.currencyCode,
          status: 'draft',
          createdBySub: user.sub,
        }),
      );
      return claim.id;
    });
    return this.getOwned(user, id);
  }

  async addLine(
    user: AuthUser,
    claimId: string,
    input: AddLineInput,
  ): Promise<ClaimView> {
    const me = await this.employees.myProfile(user.sub, user.email);
    const description = input.description?.trim();
    const amount = input.amount;
    if (!input.categoryId) {
      throw new BadRequestException('A line needs a category.');
    }
    if (!description) {
      throw new BadRequestException('A line needs a description.');
    }
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number.');
    }
    if (!input.expenseDate || Number.isNaN(Date.parse(input.expenseDate))) {
      throw new BadRequestException('A valid expense date is required.');
    }
    const receipt = this.decodeReceipt(input.receipt);

    await this.db.withTenant(async (m) => {
      const claim = await this.ownDraft(m, claimId, me.id);
      const category = await m.findOne(ExpenseCategory, {
        where: { id: input.categoryId },
      });
      if (!category || !category.active) {
        throw new BadRequestException('Unknown or inactive expense category.');
      }
      if (
        category.legalEntityId &&
        category.legalEntityId !== claim.legalEntityId
      ) {
        throw new BadRequestException(
          'That category belongs to another legal entity.',
        );
      }
      // Policy limit enforced at entry (FR-M8-02): a line over its category cap
      // is refused, so a claim cannot be built past policy.
      const cap = category.limitAmount == null ? null : Number(category.limitAmount);
      if (cap != null && amount > cap) {
        throw new BadRequestException(
          `This exceeds the ${category.name} limit of ${cap.toFixed(2)} ${claim.currencyCode}.`,
        );
      }
      await m.save(
        m.create(ExpenseClaimLine, {
          tenantId: this.db.tenantId,
          claimId: claim.id,
          categoryId: category.id,
          expenseDate: input.expenseDate,
          description,
          amount: amount.toFixed(2),
          receipt: receipt?.bytes ?? null,
          receiptFilename: receipt?.filename ?? null,
          receiptMime: receipt?.mime ?? null,
        }),
      );
    });
    return this.getOwned(user, claimId);
  }

  async removeLine(
    user: AuthUser,
    claimId: string,
    lineId: string,
  ): Promise<ClaimView> {
    const me = await this.employees.myProfile(user.sub, user.email);
    await this.db.withTenant(async (m) => {
      const claim = await this.ownDraft(m, claimId, me.id);
      const line = await m.findOne(ExpenseClaimLine, {
        where: { id: lineId, claimId: claim.id },
      });
      if (!line) {
        throw new NotFoundException('Claim line not found.');
      }
      await m.remove(line);
    });
    return this.getOwned(user, claimId);
  }

  async submit(user: AuthUser, claimId: string): Promise<ClaimView> {
    const me = await this.employees.myProfile(user.sub, user.email);
    await this.db.withTenant(async (m) => {
      const claim = await this.ownDraft(m, claimId, me.id);
      const lines = await m.find(ExpenseClaimLine, {
        where: { claimId: claim.id },
      });
      if (lines.length === 0) {
        throw new BadRequestException('Add at least one line before submitting.');
      }
      // Re-check every line against the current cap: a limit could have been
      // lowered after a line was added.
      let total = 0;
      for (const line of lines) {
        const category = await m.findOne(ExpenseCategory, {
          where: { id: line.categoryId },
        });
        const cap = category?.limitAmount == null ? null : Number(category.limitAmount);
        if (cap != null && Number(line.amount) > cap) {
          throw new BadRequestException(
            `"${line.description}" exceeds the ${category?.name} limit of ${cap.toFixed(2)}. ` +
              'Edit it before submitting.',
          );
        }
        total += Number(line.amount);
      }

      const approval = await this.workflow.createRequest({
        requestType: 'expense_claim',
        resourceType: 'expense',
        resourceId: claim.id,
        payload: {
          employeeId: me.id,
          title: claim.title,
          amount: Number(total.toFixed(2)),
          currencyCode: claim.currencyCode,
          lineCount: lines.length,
        },
        approverRoles: EXPENSE_APPROVER_ROLES,
      });

      claim.status = 'pending';
      claim.approvalRequestId = approval.request.id;
      claim.submittedAt = new Date();
      await m.save(claim);
      await this.audit.record(
        {
          action: 'expense_claim.submit',
          resourceType: 'expense_claim',
          resourceId: claim.id,
          after: { total: Number(total.toFixed(2)), lines: lines.length },
        },
        m,
      );
    });
    return this.getOwned(user, claimId);
  }

  async cancel(user: AuthUser, claimId: string): Promise<void> {
    const me = await this.employees.myProfile(user.sub, user.email);
    await this.db.withTenant(async (m) => {
      const claim = await m.findOne(ExpenseClaim, { where: { id: claimId } });
      if (!claim || claim.employeeId !== me.id) {
        throw new NotFoundException('Claim not found.');
      }
      if (claim.status !== 'draft' && claim.status !== 'pending') {
        throw new BadRequestException(
          'Only a draft or pending claim can be cancelled.',
        );
      }
      claim.status = 'cancelled';
      await m.save(claim);
      await this.audit.record(
        {
          action: 'expense_claim.cancel',
          resourceType: 'expense_claim',
          resourceId: claimId,
        },
        m,
      );
    });
  }

  // --- HR / payroll.

  listAll(legalEntityId?: string): Promise<ClaimView[]> {
    return this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      return this.claimViews(m, legalEntityId ? { legalEntityId } : {});
    });
  }

  get(id: string): Promise<ClaimView> {
    return this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      const [claim] = await this.claimViews(m, { id });
      if (!claim) {
        throw new NotFoundException('Claim not found.');
      }
      return claim;
    });
  }

  async settle(
    id: string,
    method: ExpenseSettlementMethod,
    user: AuthUser,
  ): Promise<ClaimView> {
    if (method !== 'payroll' && method !== 'disbursement') {
      throw new BadRequestException(
        'Settlement method must be "payroll" or "disbursement".',
      );
    }
    await this.db.withTenant(async (m) => {
      await this.syncApprovals(m);
      const claim = await m.findOne(ExpenseClaim, { where: { id } });
      if (!claim) {
        throw new NotFoundException('Claim not found.');
      }
      if (claim.status !== 'approved') {
        throw new BadRequestException(
          `Only an approved claim can be settled (this one is ${claim.status}).`,
        );
      }
      const total = await this.claimTotal(m, claim.id);
      if (method === 'payroll') {
        // Pay it on the next run by raising an already-approved adjustment
        // (the claim carried its own approval), reusing T-2.5 settlement.
        claim.adjustmentId = await this.adjustments.createApproved(m, {
          employeeId: claim.employeeId,
          legalEntityId: claim.legalEntityId,
          amount: total,
          currencyCode: claim.currencyCode,
          reason: `Expense claim: ${claim.title}`,
          createdBySub: user.sub,
        });
      }
      claim.status = 'settled';
      claim.settlementMethod = method;
      claim.settledAt = new Date();
      await m.save(claim);
      await this.audit.record(
        {
          action: 'expense_claim.settle',
          resourceType: 'expense_claim',
          resourceId: id,
          after: { method, total },
        },
        m,
      );
      const employee = await m.findOne(Employee, {
        where: { id: claim.employeeId },
      });
      if (employee?.keycloakSub) {
        const where =
          method === 'payroll'
            ? 'It will be paid with your next payroll run.'
            : 'It has been paid by direct disbursement.';
        await this.notifications.notify(
          {
            recipientSub: employee.keycloakSub,
            type: 'expense.settled',
            title: 'Expense claim settled',
            body: `Your claim "${claim.title}" for ${total.toFixed(2)} ${claim.currencyCode} was settled. ${where}`,
            data: { claimId: id },
          },
          m,
        );
      }
    });
    return this.get(id);
  }

  // Returns the receipt bytes for a line. The employee sees their own; HR (via
  // the payroll:read route) sees any.
  async receipt(
    claimId: string,
    lineId: string,
    scopeToEmployee?: AuthUser,
  ): Promise<ReceiptFile> {
    let employeeId: string | undefined;
    if (scopeToEmployee) {
      const me = await this.employees.myProfile(
        scopeToEmployee.sub,
        scopeToEmployee.email,
      );
      employeeId = me.id;
    }
    return this.db.withTenant(async (m) => {
      const claim = await m.findOne(ExpenseClaim, { where: { id: claimId } });
      if (!claim || (employeeId && claim.employeeId !== employeeId)) {
        throw new NotFoundException('Claim not found.');
      }
      const line = await m.findOne(ExpenseClaimLine, {
        where: { id: lineId, claimId },
      });
      if (!line || !line.receipt) {
        throw new NotFoundException('No receipt on this line.');
      }
      return {
        filename: line.receiptFilename ?? 'receipt',
        mime: line.receiptMime ?? 'application/octet-stream',
        bytes: line.receipt,
      };
    });
  }

  // --- Internals.

  // Reflects approval decisions, like payroll runs and adjustments: the
  // workflow has no post-approval hook, so a decision lands on the next read.
  async syncApprovals(m: EntityManager): Promise<void> {
    await m.query(`
      UPDATE expense_claims c
         SET status = 'approved', updated_at = now()
        FROM approval_requests ar
       WHERE ar.id = c.approval_request_id
         AND c.status = 'pending'
         AND ar.status = 'approved'
    `);
    await m.query(`
      UPDATE expense_claims c
         SET status = 'rejected', updated_at = now()
        FROM approval_requests ar
       WHERE ar.id = c.approval_request_id
         AND c.status = 'pending'
         AND ar.status = 'rejected'
    `);
  }

  private async getOwned(user: AuthUser, id: string): Promise<ClaimView> {
    const me = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      const [claim] = await this.claimViews(m, { id });
      if (!claim || claim.employeeId !== me.id) {
        throw new NotFoundException('Claim not found.');
      }
      return claim;
    });
  }

  private async ownDraft(
    m: EntityManager,
    claimId: string,
    employeeId: string,
  ): Promise<ExpenseClaim> {
    const claim = await m.findOne(ExpenseClaim, { where: { id: claimId } });
    if (!claim || claim.employeeId !== employeeId) {
      throw new NotFoundException('Claim not found.');
    }
    if (claim.status !== 'draft') {
      throw new BadRequestException(
        `A ${claim.status} claim cannot be edited.`,
      );
    }
    return claim;
  }

  private async claimTotal(m: EntityManager, claimId: string): Promise<number> {
    const [{ total }] = (await m.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM expense_claim_lines WHERE claim_id = $1`,
      [claimId],
    )) as [{ total: number }];
    return Number(total.toFixed(2));
  }

  private decodeReceipt(
    input?: ReceiptInput,
  ): { bytes: Buffer; filename: string | null; mime: string | null } | null {
    if (!input || !input.dataBase64) {
      return null;
    }
    const bytes = Buffer.from(input.dataBase64, 'base64');
    if (bytes.length === 0) {
      throw new BadRequestException('The receipt file is empty.');
    }
    if (bytes.length > MAX_RECEIPT_BYTES) {
      throw new BadRequestException('A receipt must be 5 MB or smaller.');
    }
    return {
      bytes,
      filename: input.filename?.trim() || null,
      mime: input.mime?.trim() || null,
    };
  }

  // Loads claims plus their lines in two queries, grouped in JS.
  private async claimViews(
    m: EntityManager,
    where: { id?: string; employeeId?: string; legalEntityId?: string },
  ): Promise<ClaimView[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (where.id) {
      params.push(where.id);
      clauses.push(`c.id = $${params.length}`);
    }
    if (where.employeeId) {
      params.push(where.employeeId);
      clauses.push(`c.employee_id = $${params.length}`);
    }
    if (where.legalEntityId) {
      params.push(where.legalEntityId);
      clauses.push(`c.legal_entity_id = $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const claims = (await m.query(
      `SELECT c.id,
              c.employee_id AS "employeeId",
              e.employee_code AS "employeeCode",
              e.first_name || ' ' || e.last_name AS "employeeName",
              c.title,
              c.currency_code AS "currencyCode",
              c.status,
              c.settlement_method AS "settlementMethod",
              c.settled_at AS "settledAt",
              c.submitted_at AS "submittedAt",
              c.created_at AS "createdAt"
         FROM expense_claims c
         JOIN employees e ON e.id = c.employee_id
         ${filter}
        ORDER BY c.created_at DESC`,
      params,
    )) as Omit<ClaimView, 'total' | 'lines'>[];
    if (claims.length === 0) {
      return [];
    }

    const ids = claims.map((c) => c.id);
    const lines = (await m.query(
      `SELECT l.id,
              l.claim_id AS "claimId",
              l.category_id AS "categoryId",
              cat.code AS "categoryCode",
              cat.name AS "categoryName",
              to_char(l.expense_date, 'YYYY-MM-DD') AS "expenseDate",
              l.description,
              l.amount::float AS amount,
              (l.receipt IS NOT NULL) AS "hasReceipt",
              l.receipt_filename AS "receiptFilename"
         FROM expense_claim_lines l
         JOIN expense_categories cat ON cat.id = l.category_id
        WHERE l.claim_id = ANY($1)
        ORDER BY l.expense_date ASC, l.created_at ASC`,
      [ids],
    )) as (ClaimLineView & { claimId: string })[];

    const byClaim = new Map<string, ClaimLineView[]>();
    for (const line of lines) {
      const { claimId, ...view } = line;
      const list = byClaim.get(claimId) ?? [];
      list.push(view);
      byClaim.set(claimId, list);
    }

    return claims.map((c) => {
      const claimLines = byClaim.get(c.id) ?? [];
      const total = claimLines.reduce((sum, l) => sum + l.amount, 0);
      return { ...c, total: Number(total.toFixed(2)), lines: claimLines };
    });
  }
}
