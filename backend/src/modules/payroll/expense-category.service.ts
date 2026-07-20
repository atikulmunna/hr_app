import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { ExpenseCategory } from '../../entities/expense-category.entity';
import { AuditService } from '../audit/audit.service';

export interface CreateExpenseCategoryInput {
  code?: string;
  name?: string;
  legalEntityId?: string | null;
  limitAmount?: number | null;
}

export interface UpdateExpenseCategoryInput {
  name?: string;
  limitAmount?: number | null;
  active?: boolean;
}

export interface ExpenseCategoryView {
  id: string;
  code: string;
  name: string;
  legalEntityId: string | null;
  limitAmount: number | null;
  active: boolean;
}

// Expense policy categories (T-2.6, FR-M8-02). Each holds an optional per-line
// cap that a claim line may not exceed.
@Injectable()
export class ExpenseCategoryService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(activeOnly = false): Promise<ExpenseCategoryView[]> {
    return this.db.withTenant(async (m) => {
      const rows = await m.find(ExpenseCategory, {
        order: { code: 'ASC' },
      });
      return rows
        .filter((c) => !activeOnly || c.active)
        .map((c) => this.view(c));
    });
  }

  async create(
    input: CreateExpenseCategoryInput,
  ): Promise<ExpenseCategoryView> {
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException('Code and name are required.');
    }
    const limitAmount = this.normalizeLimit(input.limitAmount);

    return this.db.withTenant(async (m) => {
      try {
        const category = await m.save(
          m.create(ExpenseCategory, {
            tenantId: this.db.tenantId,
            legalEntityId: input.legalEntityId ?? null,
            code,
            name,
            limitAmount: limitAmount == null ? null : limitAmount.toFixed(2),
            active: true,
          }),
        );
        await this.audit.record(
          {
            action: 'expense_category.create',
            resourceType: 'expense_category',
            resourceId: category.id,
            after: { code, name, limitAmount },
          },
          m,
        );
        return this.view(category);
      } catch (e) {
        if (e instanceof QueryFailedError && /idx_expense_categories_code/.test(e.message)) {
          throw new BadRequestException(
            `An expense category with code "${code}" already exists.`,
          );
        }
        throw e;
      }
    });
  }

  async update(
    id: string,
    input: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategoryView> {
    return this.db.withTenant(async (m) => {
      const category = await m.findOne(ExpenseCategory, { where: { id } });
      if (!category) {
        throw new NotFoundException('Expense category not found.');
      }
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) {
          throw new BadRequestException('Name cannot be blank.');
        }
        category.name = name;
      }
      if (input.limitAmount !== undefined) {
        const limit = this.normalizeLimit(input.limitAmount);
        category.limitAmount = limit == null ? null : limit.toFixed(2);
      }
      if (input.active !== undefined) {
        category.active = input.active;
      }
      await m.save(category);
      await this.audit.record(
        {
          action: 'expense_category.update',
          resourceType: 'expense_category',
          resourceId: id,
          after: input,
        },
        m,
      );
      return this.view(category);
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const category = await m.findOne(ExpenseCategory, { where: { id } });
      if (!category) {
        throw new NotFoundException('Expense category not found.');
      }
      try {
        await m.remove(category);
      } catch (e) {
        // A category that has been used on a claim line cannot be deleted
        // (the line references it); deactivate it instead.
        if (e instanceof QueryFailedError) {
          throw new BadRequestException(
            'This category is used on existing claims. Deactivate it instead of deleting.',
          );
        }
        throw e;
      }
      await this.audit.record(
        {
          action: 'expense_category.delete',
          resourceType: 'expense_category',
          resourceId: id,
        },
        m,
      );
    });
  }

  private normalizeLimit(value: number | null | undefined): number | null {
    if (value == null) {
      return null;
    }
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      throw new BadRequestException('A category limit must be a positive number.');
    }
    return value;
  }

  private view(c: ExpenseCategory): ExpenseCategoryView {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      legalEntityId: c.legalEntityId ?? null,
      limitAmount: c.limitAmount == null ? null : Number(c.limitAmount),
      active: c.active,
    };
  }
}
