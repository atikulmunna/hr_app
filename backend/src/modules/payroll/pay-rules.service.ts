import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  LegalEntity,
  OvertimeBase,
  OvertimeDivisor,
  ProrationBasis,
} from '../../entities/legal-entity.entity';
import { AuditService } from '../audit/audit.service';

export interface PayRulesInput {
  prorationBasis?: ProrationBasis;
  overtimeMultiplier?: number;
  overtimeBase?: OvertimeBase;
  overtimeDivisor?: OvertimeDivisor;
  overtimeFixedHours?: number | null;
}

const PRORATION_BASES: ProrationBasis[] = ['calendar_days', 'working_days'];
const OVERTIME_BASES: OvertimeBase[] = ['basic', 'gross'];
const OVERTIME_DIVISORS: OvertimeDivisor[] = ['expected_hours', 'fixed_hours'];

// A legal entity's pay policy (O-06, O-08). These are company and jurisdiction
// decisions, so HR owns them rather than a migration.
@Injectable()
export class PayRulesService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async update(id: string, input: PayRulesInput): Promise<LegalEntity> {
    return this.db.withTenant(async (m) => {
      const entity = await m.findOne(LegalEntity, { where: { id } });
      if (!entity) {
        throw new NotFoundException('Legal entity not found.');
      }

      if (input.prorationBasis !== undefined) {
        assertOneOf(input.prorationBasis, PRORATION_BASES, 'prorationBasis');
        entity.prorationBasis = input.prorationBasis;
      }
      if (input.overtimeBase !== undefined) {
        assertOneOf(input.overtimeBase, OVERTIME_BASES, 'overtimeBase');
        entity.overtimeBase = input.overtimeBase;
      }
      if (input.overtimeDivisor !== undefined) {
        assertOneOf(input.overtimeDivisor, OVERTIME_DIVISORS, 'overtimeDivisor');
        entity.overtimeDivisor = input.overtimeDivisor;
      }
      if (input.overtimeMultiplier !== undefined) {
        if (
          typeof input.overtimeMultiplier !== 'number' ||
          Number.isNaN(input.overtimeMultiplier) ||
          input.overtimeMultiplier < 1
        ) {
          throw new BadRequestException(
            'overtimeMultiplier must be a number of 1 or more.',
          );
        }
        entity.overtimeMultiplier = input.overtimeMultiplier.toFixed(2);
      }
      if (input.overtimeFixedHours !== undefined) {
        if (input.overtimeFixedHours === null) {
          entity.overtimeFixedHours = null;
        } else {
          if (
            typeof input.overtimeFixedHours !== 'number' ||
            Number.isNaN(input.overtimeFixedHours) ||
            input.overtimeFixedHours <= 0
          ) {
            throw new BadRequestException(
              'overtimeFixedHours must be a number greater than 0.',
            );
          }
          entity.overtimeFixedHours = input.overtimeFixedHours.toFixed(2);
        }
      }

      // A fixed divisor is meaningless without its hours, and the rate would
      // silently fall back to something else.
      if (
        entity.overtimeDivisor === 'fixed_hours' &&
        !Number(entity.overtimeFixedHours ?? 0)
      ) {
        throw new BadRequestException(
          'overtimeFixedHours is required when overtimeDivisor is fixed_hours. ' +
            'Singapore uses 190.67 and Bangladesh 208 hours per month.',
        );
      }

      await m.save(entity);
      await this.audit.record(
        {
          action: 'legal_entity.pay_rules_update',
          resourceType: 'legal_entity',
          resourceId: id,
          after: input,
        },
        m,
      );
      return entity;
    });
  }
}

function assertOneOf<T extends string>(
  value: T,
  allowed: T[],
  field: string,
): void {
  if (!allowed.includes(value)) {
    throw new BadRequestException(
      `${field} must be one of: ${allowed.join(', ')}.`,
    );
  }
}
