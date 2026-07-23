import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  DocumentRecord,
  DocumentVisibility,
} from '../../entities/document.entity';
import { DocumentVersion } from '../../entities/document-version.entity';
import { DocumentAcknowledgement } from '../../entities/document-acknowledgement.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { NotificationService } from '../notifications/notification.service';

const VISIBILITIES: DocumentVisibility[] = ['hr_only', 'employee', 'all'];
// A document within this many days of expiry (or already expired) raises a
// one-shot reminder the next time the list is read.
const REMINDER_WINDOW_DAYS = 30;

export interface CreateDocumentInput {
  employeeId?: string | null;
  name?: string;
  category?: string;
  docType?: string;
  visibility?: DocumentVisibility;
  requiresAcknowledgement?: boolean;
  sha256?: string;
  note?: string;
  expiresOn?: string | null;
}

export interface AddVersionInput {
  sha256?: string;
  note?: string;
  expiresOn?: string | null;
}

export interface DocumentView {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  name: string;
  category: string;
  docType: string | null;
  visibility: DocumentVisibility;
  requiresAcknowledgement: boolean;
  currentVersion: number;
  expiresOn: string | null;
  status: 'valid' | 'expiring' | 'expired';
  daysToExpiry: number | null;
  versionCount: number;
  acknowledgedCount: number;
}

// Employee and org-wide documents with version history and access control
// (T-3.4, FR-M1-07), expiry reminders (FR-M1-08), and e-signature over a version
// for letters and policy acknowledgements (FR-M1-09).
@Injectable()
export class DocumentService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // --- HR views.

  list(filter: { employeeId?: string; category?: string }): Promise<DocumentView[]> {
    return this.db.withTenant(async (m) => {
      await this.syncReminders(m);
      const params: unknown[] = [];
      const clauses: string[] = [];
      if (filter.employeeId) {
        params.push(filter.employeeId);
        clauses.push(`d.employee_id = $${params.length}`);
      }
      if (filter.category) {
        params.push(filter.category);
        clauses.push(`d.category = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return (await m.query(this.selectDocuments(where), params)) as DocumentView[];
    });
  }

  get(id: string): Promise<{
    document: DocumentView;
    versions: unknown[];
    acknowledgements: unknown[];
  }> {
    return this.db.withTenant(async (m) => {
      const [document] = (await m.query(this.selectDocuments('WHERE d.id = $1'), [
        id,
      ])) as DocumentView[];
      if (!document) {
        throw new NotFoundException('Document not found.');
      }
      const versions = await m.query(
        `SELECT id, version, sha256, note, uploaded_by_sub AS "uploadedBySub",
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt"
           FROM document_versions WHERE document_id = $1 ORDER BY version DESC`,
        [id],
      );
      const acknowledgements = await m.query(
        `SELECT id, version, signer_sub AS "signerSub", signer_name AS "signerName",
                sha256, signer_ip AS "signerIp",
                to_char(signed_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "signedAt"
           FROM document_acknowledgements WHERE document_id = $1 ORDER BY signed_at DESC`,
        [id],
      );
      return { document, versions, acknowledgements };
    });
  }

  async create(user: AuthUser, input: CreateDocumentInput): Promise<DocumentView> {
    const name = input.name?.trim();
    const sha256 = input.sha256?.trim();
    if (!name) {
      throw new BadRequestException('A document needs a name.');
    }
    if (!sha256) {
      throw new BadRequestException('A document version needs a file hash.');
    }
    const visibility = input.visibility ?? 'hr_only';
    if (!VISIBILITIES.includes(visibility)) {
      throw new BadRequestException('Unknown visibility.');
    }
    const id = await this.db.withTenant(async (m) => {
      if (input.employeeId) {
        const employee = await m.query(`SELECT 1 FROM employees WHERE id = $1`, [
          input.employeeId,
        ]);
        if (!employee.length) {
          throw new BadRequestException('Unknown employee.');
        }
      }
      const doc = await m.save(
        m.create(DocumentRecord, {
          tenantId: this.db.tenantId,
          employeeId: input.employeeId ?? null,
          name,
          category: input.category?.trim() || 'other',
          docType: input.docType?.trim() || undefined,
          visibility,
          requiresAcknowledgement: input.requiresAcknowledgement ?? false,
          currentVersion: 1,
          expiresOn: input.expiresOn || null,
          createdBySub: user.sub,
        }),
      );
      await m.save(
        m.create(DocumentVersion, {
          tenantId: this.db.tenantId,
          documentId: doc.id,
          version: 1,
          sha256,
          note: input.note?.trim() || undefined,
          uploadedBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'document.create',
          resourceType: 'document',
          resourceId: doc.id,
          after: { name, category: doc.category, visibility },
        },
        m,
      );
      return doc.id;
    });
    return this.getView(id);
  }

  // A new version supersedes the current one; a renewal that carries a fresh
  // expiry re-arms the reminder so the next window fires again.
  async addVersion(
    user: AuthUser,
    id: string,
    input: AddVersionInput,
  ): Promise<DocumentView> {
    const sha256 = input.sha256?.trim();
    if (!sha256) {
      throw new BadRequestException('A new version needs a file hash.');
    }
    await this.db.withTenant(async (m) => {
      const doc = await m.findOne(DocumentRecord, { where: { id } });
      if (!doc) {
        throw new NotFoundException('Document not found.');
      }
      const version = doc.currentVersion + 1;
      await m.save(
        m.create(DocumentVersion, {
          tenantId: this.db.tenantId,
          documentId: id,
          version,
          sha256,
          note: input.note?.trim() || undefined,
          uploadedBySub: user.sub,
        }),
      );
      doc.currentVersion = version;
      if (input.expiresOn !== undefined) {
        doc.expiresOn = input.expiresOn || null;
        doc.reminderSentAt = null;
      }
      await m.save(doc);
      await this.audit.record(
        {
          action: 'document.version',
          resourceType: 'document',
          resourceId: id,
          after: { version },
        },
        m,
      );
    });
    return this.getView(id);
  }

  async remove(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      await m.delete(DocumentRecord, { id });
    });
  }

  // --- Employee self-service.

  mine(user: AuthUser): Promise<unknown[]> {
    return this.db.withTenant(async (m) => {
      const employeeId = await this.resolveEmployeeId(m, user);
      return m.query(
        `SELECT d.id, d.name, d.category, d.doc_type AS "docType", d.visibility,
                d.requires_acknowledgement AS "requiresAcknowledgement",
                d.current_version AS "currentVersion",
                to_char(d.expires_on, 'YYYY-MM-DD') AS "expiresOn",
                v.sha256 AS "currentSha256",
                EXISTS (
                  SELECT 1 FROM document_acknowledgements a
                   WHERE a.document_id = d.id AND a.signer_sub = $1
                     AND a.version = d.current_version
                ) AS "acknowledged",
                (
                  SELECT to_char(a.signed_at, 'YYYY-MM-DD"T"HH24:MI:SS')
                    FROM document_acknowledgements a
                   WHERE a.document_id = d.id AND a.signer_sub = $1
                     AND a.version = d.current_version
                ) AS "signedAt"
           FROM documents d
           LEFT JOIN document_versions v
             ON v.document_id = d.id AND v.version = d.current_version
          WHERE d.visibility = 'all'
             OR (d.visibility = 'employee' AND d.employee_id = $2)
          ORDER BY d.requires_acknowledgement DESC, d.name ASC`,
        [user.sub ?? '', employeeId],
      );
    });
  }

  // Records the e-signature (typed name + hash + IP) over the current version.
  async acknowledge(
    user: AuthUser,
    id: string,
    signerName: string,
    ip: string,
  ): Promise<{ documentId: string; version: number; signedAt: string }> {
    const name = signerName?.trim();
    if (!name) {
      throw new BadRequestException('A typed full name is required to sign.');
    }
    return this.db.withTenant(async (m) => {
      const doc = await m.findOne(DocumentRecord, { where: { id } });
      if (!doc) {
        throw new NotFoundException('Document not found.');
      }
      if (!doc.requiresAcknowledgement) {
        throw new BadRequestException('This document does not require acknowledgement.');
      }
      const employeeId = await this.resolveEmployeeId(m, user);
      const visible =
        doc.visibility === 'all' ||
        (doc.visibility === 'employee' && !!employeeId && doc.employeeId === employeeId);
      if (!visible) {
        throw new ForbiddenException('This document is not shared with you.');
      }
      const version = doc.currentVersion;
      const current = await m.findOne(DocumentVersion, {
        where: { documentId: id, version },
      });
      const already = await m.findOne(DocumentAcknowledgement, {
        where: { documentId: id, signerSub: user.sub, version },
      });
      if (already) {
        throw new BadRequestException('You have already signed this version.');
      }
      const ack = await m.save(
        m.create(DocumentAcknowledgement, {
          tenantId: this.db.tenantId,
          documentId: id,
          version,
          signerSub: user.sub ?? '',
          signerName: name,
          sha256: current?.sha256 ?? '',
          signerIp: ip,
        }),
      );
      await this.audit.record(
        {
          action: 'document.acknowledge',
          resourceType: 'document',
          resourceId: id,
          after: { signerName: name, version, ip },
        },
        m,
      );
      return { documentId: id, version, signedAt: ack.signedAt.toISOString() };
    });
  }

  // --- Internals.

  private getView(id: string): Promise<DocumentView> {
    return this.db.withTenant(async (m) => {
      const [view] = (await m.query(this.selectDocuments('WHERE d.id = $1'), [
        id,
      ])) as DocumentView[];
      return view;
    });
  }

  private selectDocuments(where: string): string {
    return `
      SELECT d.id,
             d.employee_id AS "employeeId",
             CASE WHEN e.id IS NULL THEN NULL
                  ELSE e.first_name || ' ' || e.last_name END AS "employeeName",
             e.employee_code AS "employeeCode",
             d.name, d.category, d.doc_type AS "docType", d.visibility,
             d.requires_acknowledgement AS "requiresAcknowledgement",
             d.current_version AS "currentVersion",
             to_char(d.expires_on, 'YYYY-MM-DD') AS "expiresOn",
             CASE
               WHEN d.expires_on IS NULL THEN 'valid'
               WHEN d.expires_on < current_date THEN 'expired'
               WHEN d.expires_on <= current_date + ${REMINDER_WINDOW_DAYS} THEN 'expiring'
               ELSE 'valid'
             END AS status,
             CASE WHEN d.expires_on IS NULL THEN NULL
                  ELSE (d.expires_on - current_date) END AS "daysToExpiry",
             (SELECT count(*)::int FROM document_versions v WHERE v.document_id = d.id) AS "versionCount",
             (SELECT count(*)::int FROM document_acknowledgements a
                WHERE a.document_id = d.id AND a.version = d.current_version) AS "acknowledgedCount"
        FROM documents d
        LEFT JOIN employees e ON e.id = d.employee_id
        ${where}
       ORDER BY (d.expires_on IS NULL), d.expires_on ASC, d.name ASC`;
  }

  private async resolveEmployeeId(
    m: EntityManager,
    user: AuthUser,
  ): Promise<string | null> {
    const rows = (await m.query(
      `SELECT id FROM employees
        WHERE keycloak_sub = $1 OR (email = $2 AND $2 <> '')
        LIMIT 1`,
      [user.sub ?? '', user.email ?? ''],
    )) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  // Materializes reminders for documents inside the expiry window not yet
  // reminded: one to HR and one to the linked employee, then stamps the guard.
  private async syncReminders(m: EntityManager): Promise<void> {
    const due = (await m.query(
      `SELECT d.id, d.name,
              to_char(d.expires_on, 'YYYY-MM-DD') AS "expiresOn",
              (d.expires_on < current_date) AS expired,
              e.keycloak_sub AS "keycloakSub"
         FROM documents d
         LEFT JOIN employees e ON e.id = d.employee_id
        WHERE d.expires_on IS NOT NULL
          AND d.expires_on <= current_date + ${REMINDER_WINDOW_DAYS}
          AND d.reminder_sent_at IS NULL`,
    )) as {
      id: string;
      name: string;
      expiresOn: string;
      expired: boolean;
      keycloakSub: string | null;
    }[];

    for (const doc of due) {
      const title = doc.expired ? 'Document expired' : 'Document expiring soon';
      const verb = doc.expired ? 'expired on' : 'expires on';
      const body = `${doc.name} ${verb} ${doc.expiresOn}.`;
      const data = { documentId: doc.id, expiresOn: doc.expiresOn };
      await this.notifications.notify(
        { recipientRole: 'hr_admin', type: 'document.expiry', title, body, data },
        m,
      );
      if (doc.keycloakSub) {
        await this.notifications.notify(
          { recipientSub: doc.keycloakSub, type: 'document.expiry', title, body, data },
          m,
        );
      }
    }

    if (due.length) {
      await m.query(
        `UPDATE documents SET reminder_sent_at = now(), updated_at = now()
          WHERE id = ANY($1)`,
        [due.map((d) => d.id)],
      );
    }
  }
}
