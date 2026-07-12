import { BadRequestException, Injectable } from '@nestjs/common';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { TenantDbService } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';

export interface CreateLegalEntityInput {
  name: string;
  countryCode: string;
  currencyCode: string;
  residencyRegion?: string;
}

@Injectable()
export class EntitiesService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<LegalEntity[]> {
    return this.db.withTenant((m) =>
      m.find(LegalEntity, { order: { name: 'ASC' } }),
    );
  }

  create(input: CreateLegalEntityInput): Promise<LegalEntity> {
    if (!input?.name || !input?.countryCode || !input?.currencyCode) {
      throw new BadRequestException(
        'name, countryCode, and currencyCode are required.',
      );
    }
    return this.db.withTenant(async (m) => {
      const entity = await m.save(
        m.create(LegalEntity, {
          tenantId: this.db.tenantId,
          name: input.name,
          countryCode: input.countryCode,
          currencyCode: input.currencyCode,
          residencyRegion: input.residencyRegion ?? 'default',
        }),
      );
      // Audited within the same tenant transaction as the write.
      await this.audit.record(
        {
          action: 'legal_entity.create',
          resourceType: 'legal_entity',
          resourceId: entity.id,
          after: entity,
        },
        m,
      );
      return entity;
    });
  }
}
