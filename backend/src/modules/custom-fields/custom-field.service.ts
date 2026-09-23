import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  CUSTOM_FIELD_TYPES,
  CustomFieldDefinition,
  CustomFieldType,
} from '../../entities/custom-field-definition.entity';
import { AuditService } from '../audit/audit.service';
import { validateCustomFields } from './custom-field.validation';

export interface CreateFieldInput {
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options?: string[];
  required?: boolean;
  displayOrder?: number;
}

export interface UpdateFieldInput {
  label?: string;
  options?: string[];
  required?: boolean;
  active?: boolean;
  displayOrder?: number;
}

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

@Injectable()
export class CustomFieldService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<CustomFieldDefinition[]> {
    return this.db.withTenant((m) =>
      m.find(CustomFieldDefinition, {
        order: { displayOrder: 'ASC', fieldKey: 'ASC' },
      }),
    );
  }

  createDefinition(input: CreateFieldInput): Promise<CustomFieldDefinition> {
    const fieldKey = (input?.fieldKey ?? '').trim();
    if (!FIELD_KEY_PATTERN.test(fieldKey)) {
      throw new BadRequestException(
        'fieldKey must be lower_snake_case and start with a letter.',
      );
    }
    const label = (input?.label ?? '').trim();
    if (!label) {
      throw new BadRequestException('label is required.');
    }
    if (!CUSTOM_FIELD_TYPES.includes(input?.fieldType)) {
      throw new BadRequestException(
        `fieldType must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}.`,
      );
    }
    const options =
      input.fieldType === 'select'
        ? this.requireOptions(input.options)
        : undefined;

    return this.db.withTenant(async (m) => {
      const clash = await m.findOne(CustomFieldDefinition, {
        where: { fieldKey },
      });
      if (clash) {
        throw new BadRequestException(
          `A custom field "${fieldKey}" already exists.`,
        );
      }
      const definition = await m.save(
        m.create(CustomFieldDefinition, {
          tenantId: this.db.tenantId,
          fieldKey,
          label,
          fieldType: input.fieldType,
          options,
          required: input.required ?? false,
          active: true,
          displayOrder: input.displayOrder ?? 0,
        }),
      );
      await this.audit.record(
        {
          action: 'custom_field.create',
          resourceType: 'custom_field_definition',
          resourceId: definition.id,
          after: definition,
        },
        m,
      );
      return definition;
    });
  }

  updateDefinition(
    id: string,
    patch: UpdateFieldInput,
  ): Promise<CustomFieldDefinition> {
    return this.db.withTenant(async (m) => {
      const before = await this.findOrThrow(m, id);
      const changes: Partial<CustomFieldDefinition> = {};

      if (patch.label !== undefined) {
        const label = patch.label.trim();
        if (!label) throw new BadRequestException('label cannot be empty.');
        changes.label = label;
      }
      if (patch.required !== undefined) changes.required = patch.required;
      if (patch.active !== undefined) changes.active = patch.active;
      if (patch.displayOrder !== undefined) {
        changes.displayOrder = patch.displayOrder;
      }
      if (patch.options !== undefined) {
        if (before.fieldType !== 'select') {
          throw new BadRequestException('Only select fields have options.');
        }
        changes.options = this.requireOptions(patch.options);
      }

      await m.update(CustomFieldDefinition, { id }, changes);
      const after = await this.findOrThrow(m, id);
      await this.audit.record(
        {
          action: 'custom_field.update',
          resourceType: 'custom_field_definition',
          resourceId: id,
          before,
          after,
        },
        m,
      );
      return after;
    });
  }

  // Validates a values map against the tenant's definitions within the caller's
  // existing tenant transaction, returning the merged map to persist.
  async resolveForEmployee(
    m: EntityManager,
    input: Record<string, unknown> | undefined,
    existing: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const definitions = await m.find(CustomFieldDefinition);
    return validateCustomFields(input, definitions, existing);
  }

  private requireOptions(options: unknown): string[] {
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      !options.every((o) => typeof o === 'string' && o.trim().length > 0)
    ) {
      throw new BadRequestException(
        'A select field needs a non-empty options list of text values.',
      );
    }
    return options as string[];
  }

  private async findOrThrow(
    m: EntityManager,
    id: string,
  ): Promise<CustomFieldDefinition> {
    const definition = await m.findOne(CustomFieldDefinition, {
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException('Custom field definition not found.');
    }
    return definition;
  }
}
