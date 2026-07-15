import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  ConsentPlatform,
  ConsentStatement,
} from '../../entities/consent-statement.entity';
import { ConsentRecord } from '../../entities/consent-record.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';

const PLATFORMS: ConsentPlatform[] = ['android', 'ios'];

export interface PublishStatementInput {
  platform?: string;
  body?: string;
  signals?: string[];
}

export interface MyConsentView {
  statement: ConsentStatement | null;
  consent: ConsentRecord | null;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
  ) {}

  // Admin: publish a new active purpose-statement version for a platform,
  // superseding the previous active one (FR-M13-02).
  async publish(input: PublishStatementInput, actorSub: string | undefined) {
    const platform = platformOf(input.platform);
    const body = input.body?.trim();
    if (!body) {
      throw new BadRequestException('A purpose statement body is required.');
    }
    const signals = (input.signals ?? []).map((s) => s.trim()).filter(Boolean);
    return this.db.withTenant(async (m) => {
      const current = await m.findOne(ConsentStatement, {
        where: { platform, active: true },
      });
      const nextVersion = (current?.version ?? 0) + 1;
      if (current) {
        current.active = false;
        await m.save(current);
      }
      const saved = await m.save(
        m.create(ConsentStatement, {
          tenantId: this.db.tenantId,
          platform,
          version: nextVersion,
          body,
          signals,
          active: true,
          createdBy: actorSub,
        }),
      );
      await this.audit.record(
        {
          action: 'consent.statement_publish',
          resourceType: 'consent_statement',
          resourceId: saved.id,
          after: { platform, version: nextVersion },
        },
        m,
      );
      return saved;
    });
  }

  listStatements(): Promise<ConsentStatement[]> {
    return this.db.withTenant((m) =>
      m.find(ConsentStatement, {
        order: { platform: 'ASC', version: 'DESC' },
      }),
    );
  }

  // Employee: the active statement for a platform and the employee's current
  // consent to it, so the app can decide whether to prompt.
  async myConsent(user: AuthUser, platform?: string): Promise<MyConsentView> {
    const p = platformOf(platform);
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      const statement = await m.findOne(ConsentStatement, {
        where: { platform: p, active: true },
      });
      if (!statement) {
        return { statement: null, consent: null };
      }
      const consent = await m.findOne(ConsentRecord, {
        where: {
          employeeId: employee.id,
          platform: p,
          version: statement.version,
          withdrawnAt: IsNull(),
        },
      });
      return { statement, consent: consent ?? null };
    });
  }

  // Employee: grant consent to the active statement version for a platform.
  async grant(user: AuthUser, platform?: string, version?: number) {
    const p = platformOf(platform);
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      const statement = await m.findOne(ConsentStatement, {
        where: { platform: p, active: true },
      });
      if (!statement) {
        throw new NotFoundException(
          'No consent statement is published for this platform.',
        );
      }
      if (version != null && version !== statement.version) {
        throw new BadRequestException(
          'That consent version is no longer current; reload and try again.',
        );
      }
      const existing = await m.findOne(ConsentRecord, {
        where: {
          employeeId: employee.id,
          platform: p,
          version: statement.version,
          withdrawnAt: IsNull(),
        },
      });
      if (existing) {
        return existing;
      }
      const saved = await m.save(
        m.create(ConsentRecord, {
          tenantId: this.db.tenantId,
          employeeId: employee.id,
          statementId: statement.id,
          platform: p,
          version: statement.version,
          scope: statement.signals,
          grantedAt: new Date(),
        }),
      );
      await this.audit.record(
        {
          action: 'consent.grant',
          resourceType: 'consent_record',
          resourceId: saved.id,
          after: { platform: p, version: statement.version },
        },
        m,
      );
      return saved;
    });
  }

  // Employee: withdraw the active consent for a platform (FR-M13-03). The mark
  // gate then blocks live marks; attendance for withdrawn employees must go
  // through an alternative approved method (regularization, T-1C.11), which
  // collects no live signals.
  async withdraw(user: AuthUser, platform?: string) {
    const p = platformOf(platform);
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      const record = await m.findOne(ConsentRecord, {
        where: { employeeId: employee.id, platform: p, withdrawnAt: IsNull() },
        order: { grantedAt: 'DESC' },
      });
      if (!record) {
        throw new NotFoundException('You have no active consent to withdraw.');
      }
      record.withdrawnAt = new Date();
      await m.save(record);
      await this.audit.record(
        {
          action: 'consent.withdraw',
          resourceType: 'consent_record',
          resourceId: record.id,
          after: { platform: p, version: record.version },
        },
        m,
      );
      return record;
    });
  }

  // Mark gate (FR-M13-01): once a tenant has published a statement for the
  // platform, a mark requires an active consent to its current version.
  // Enforced only when a statement exists, so tenants without one are
  // unaffected.
  async assertConsented(
    m: EntityManager,
    employeeId: string,
    platform: string | undefined,
  ): Promise<void> {
    if (!platform || !PLATFORMS.includes(platform as ConsentPlatform)) {
      return;
    }
    const statement = await m.findOne(ConsentStatement, {
      where: { platform: platform as ConsentPlatform, active: true },
    });
    if (!statement) {
      return;
    }
    const consent = await m.findOne(ConsentRecord, {
      where: {
        employeeId,
        platform,
        version: statement.version,
        withdrawnAt: IsNull(),
      },
    });
    if (!consent) {
      throw new BadRequestException(
        'Please review and accept the attendance data consent statement before marking.',
      );
    }
  }
}

function platformOf(value: string | undefined): ConsentPlatform {
  if (!value || !PLATFORMS.includes(value as ConsentPlatform)) {
    throw new BadRequestException(
      `platform must be one of: ${PLATFORMS.join(', ')}.`,
    );
  }
  return value as ConsentPlatform;
}
