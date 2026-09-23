import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Certification } from '../../entities/certification.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { NotificationService } from '../notifications/notification.service';

// A certification expiring within this many days is "expiring" and triggers a
// one-shot reminder the next time the list is read.
const REMINDER_WINDOW_DAYS = 30;

export interface CreateCertificationInput {
  employeeId?: string;
  name?: string;
  issuer?: string;
  credentialId?: string;
  issuedOn?: string | null;
  expiresOn?: string | null;
}

export interface CertificationView {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  name: string;
  issuer: string | null;
  credentialId: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  status: 'valid' | 'expiring' | 'expired';
  daysToExpiry: number | null;
  reminded: boolean;
}

// Certifications and their expiry reminders (T-3.3, FR-M7-04). Status is computed
// on read; reading the list also materializes any due reminders lazily, the same
// pattern the approval workflow uses instead of a background job.
@Injectable()
export class CertificationService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // Listing certifications first fires any due expiry reminders, so the console
  // and the notification inbox stay in step without a scheduler.
  list(employeeId?: string): Promise<CertificationView[]> {
    return this.db.withTenant(async (m) => {
      await this.syncReminders(m);
      const params: unknown[] = [];
      let filter = '';
      if (employeeId) {
        params.push(employeeId);
        filter = 'WHERE c.employee_id = $1';
      }
      return (await m.query(
        `SELECT c.id,
                c.employee_id AS "employeeId",
                e.first_name || ' ' || e.last_name AS "employeeName",
                e.employee_code AS "employeeCode",
                c.name,
                c.issuer,
                c.credential_id AS "credentialId",
                to_char(c.issued_on, 'YYYY-MM-DD') AS "issuedOn",
                to_char(c.expires_on, 'YYYY-MM-DD') AS "expiresOn",
                CASE
                  WHEN c.expires_on IS NULL THEN 'valid'
                  WHEN c.expires_on < current_date THEN 'expired'
                  WHEN c.expires_on <= current_date + ${REMINDER_WINDOW_DAYS} THEN 'expiring'
                  ELSE 'valid'
                END AS status,
                CASE WHEN c.expires_on IS NULL THEN NULL
                     ELSE (c.expires_on - current_date) END AS "daysToExpiry",
                (c.reminder_sent_at IS NOT NULL) AS reminded
           FROM certifications c
           JOIN employees e ON e.id = c.employee_id
           ${filter}
          ORDER BY (c.expires_on IS NULL), c.expires_on ASC, c.name ASC`,
        params,
      )) as CertificationView[];
    });
  }

  async create(
    user: AuthUser,
    input: CreateCertificationInput,
  ): Promise<CertificationView> {
    const name = input.name?.trim();
    if (!input.employeeId || !name) {
      throw new BadRequestException(
        'An employee and certification name are required.',
      );
    }
    if (input.issuedOn && input.expiresOn && input.issuedOn > input.expiresOn) {
      throw new BadRequestException(
        'The issue date must be on or before the expiry date.',
      );
    }
    const id = await this.db.withTenant(async (m) => {
      const employee = await m.query(`SELECT 1 FROM employees WHERE id = $1`, [
        input.employeeId,
      ]);
      if (!employee.length) {
        throw new BadRequestException('Unknown employee.');
      }
      const cert = await m.save(
        m.create(Certification, {
          tenantId: this.db.tenantId,
          employeeId: input.employeeId,
          name,
          issuer: input.issuer?.trim() || undefined,
          credentialId: input.credentialId?.trim() || undefined,
          issuedOn: input.issuedOn || null,
          expiresOn: input.expiresOn || null,
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'certification.create',
          resourceType: 'certification',
          resourceId: cert.id,
          after: {
            name,
            employeeId: input.employeeId,
            expiresOn: input.expiresOn ?? null,
          },
        },
        m,
      );
      return cert.id;
    });
    const [view] = await this.list().then((rows) =>
      rows.filter((r) => r.id === id),
    );
    return view;
  }

  async remove(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      await m.delete(Certification, { id });
    });
  }

  // Materializes reminders for certifications inside the expiry window that have
  // not been reminded yet: one notification to HR and one to the employee (when
  // their identity is known), then stamps reminder_sent_at so it fires once.
  private async syncReminders(m: EntityManager): Promise<void> {
    const due = (await m.query(
      `SELECT c.id,
              c.name,
              to_char(c.expires_on, 'YYYY-MM-DD') AS "expiresOn",
              (c.expires_on < current_date) AS expired,
              e.first_name || ' ' || e.last_name AS "employeeName",
              e.keycloak_sub AS "keycloakSub"
         FROM certifications c
         JOIN employees e ON e.id = c.employee_id
        WHERE c.expires_on IS NOT NULL
          AND c.expires_on <= current_date + ${REMINDER_WINDOW_DAYS}
          AND c.reminder_sent_at IS NULL`,
    )) as {
      id: string;
      name: string;
      expiresOn: string;
      expired: boolean;
      employeeName: string;
      keycloakSub: string | null;
    }[];

    for (const cert of due) {
      const title = cert.expired
        ? 'Certification expired'
        : 'Certification expiring soon';
      const verb = cert.expired ? 'expired on' : 'expires on';
      const body = `${cert.name} for ${cert.employeeName} ${verb} ${cert.expiresOn}.`;
      const data = { certificationId: cert.id, expiresOn: cert.expiresOn };
      await this.notifications.notify(
        {
          recipientRole: 'hr_admin',
          type: 'certification.expiry',
          title,
          body,
          data,
        },
        m,
      );
      if (cert.keycloakSub) {
        await this.notifications.notify(
          {
            recipientSub: cert.keycloakSub,
            type: 'certification.expiry',
            title,
            body,
            data,
          },
          m,
        );
      }
    }

    if (due.length) {
      await m.query(
        `UPDATE certifications SET reminder_sent_at = now(), updated_at = now()
          WHERE id = ANY($1)`,
        [due.map((c) => c.id)],
      );
    }
  }
}
