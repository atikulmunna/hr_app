import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  PayComponent,
  PayComponentType,
} from '../../entities/pay-component.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { AuditService } from '../audit/audit.service';

const COMPONENT_TYPES: PayComponentType[] = [
  'basic',
  'allowance',
  'bonus',
  'deduction',
];

export interface CreatePayComponentInput {
  code?: string;
  name?: string;
  componentType?: PayComponentType;
  legalEntityId?: string;
  taxable?: boolean;
}

export type UpdatePayComponentInput = {
  name?: string;
  taxable?: boolean;
  active?: boolean;
};

const UPDATABLE_FIELDS: (keyof UpdatePayComponentInput)[] = [
  'name',
  'taxable',
  'active',
];

// The tenant's catalog of pay components (T-2.1, FR-M4-01).
@Injectable()
export class PayComponentService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(activeOnly = false): Promise<PayComponent[]> {
    return this.db.withTenant((m) =>
      m.find(PayComponent, {
        where: activeOnly ? { active: true } : {},
        order: { componentType: 'ASC', name: 'ASC' },
      }),
    );
  }

  async create(input: CreatePayComponentInput): Promise<PayComponent> {
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException('A pay component needs a code and a name.');
    }
    if (
      !input.componentType ||
      !COMPONENT_TYPES.includes(input.componentType)
    ) {
      throw new BadRequestException(
        `componentType must be one of: ${COMPONENT_TYPES.join(', ')}.`,
      );
    }

    return this.db.withTenant(async (m) => {
      const existing = await m.findOne(PayComponent, { where: { code } });
      if (existing) {
        throw new BadRequestException(
          `Pay component code "${code}" is already in use.`,
        );
      }
      if (input.legalEntityId) {
        await this.assertEntityExists(m, input.legalEntityId);
      }

      const component = await m.save(
        m.create(PayComponent, {
          tenantId: this.db.tenantId,
          legalEntityId: input.legalEntityId ?? null,
          code,
          name,
          componentType: input.componentType,
          // A deduction is not itself taxable income; earnings default to taxable.
          taxable: input.taxable ?? input.componentType !== 'deduction',
          active: true,
        }),
      );
      await this.audit.record(
        {
          action: 'pay_component.create',
          resourceType: 'pay_component',
          resourceId: component.id,
          after: { code, name, componentType: component.componentType },
        },
        m,
      );
      return component;
    });
  }

  async update(
    id: string,
    patch: UpdatePayComponentInput,
  ): Promise<PayComponent> {
    return this.db.withTenant(async (m) => {
      const component = await m.findOne(PayComponent, { where: { id } });
      if (!component) {
        throw new NotFoundException('Pay component not found.');
      }
      for (const field of UPDATABLE_FIELDS) {
        if (patch[field] !== undefined) {
          (component as unknown as Record<string, unknown>)[field] =
            patch[field];
        }
      }
      await m.save(component);
      await this.audit.record(
        {
          action: 'pay_component.update',
          resourceType: 'pay_component',
          resourceId: id,
          after: patch,
        },
        m,
      );
      return component;
    });
  }

  private async assertEntityExists(
    m: EntityManager,
    legalEntityId: string,
  ): Promise<void> {
    const entity = await m.findOne(LegalEntity, {
      where: { id: legalEntityId },
    });
    if (!entity) {
      throw new BadRequestException('Unknown legal entity.');
    }
  }
}
