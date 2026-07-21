import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Application } from '../../entities/application.entity';
import { JobRequisition } from '../../entities/job-requisition.entity';
import { LegalEntity } from '../../entities/legal-entity.entity';
import { Offer } from '../../entities/offer.entity';
import { PipelineStage } from '../../entities/pipeline-stage.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';
import { RequisitionService } from './requisition.service';

export interface CreateOfferInput {
  salaryAmount?: number;
  currencyCode?: string;
  startDate?: string;
}

export interface OfferView {
  id: string;
  applicationId: string;
  candidateName: string;
  requisitionTitle: string;
  salaryAmount: number;
  currencyCode: string;
  startDate: string;
  letterBody: string;
  documentHash: string;
  status: string;
  signerName: string | null;
  signedAt: string | null;
  signerIp: string | null;
  employeeId: string | null;
  createdAt: string;
}

// Offer letters, click-to-sign, and conversion to an employee (T-3.1,
// FR-M5-07, FR-M1-09). Sending freezes the letter text with a SHA-256 hash;
// signing records the candidate's typed name, the time, and the client IP as a
// tamper-evident audit; a signed offer converts the candidate into an employee,
// the start of onboarding.
@Injectable()
export class OfferService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly requisitions: RequisitionService,
  ) {}

  get(id: string): Promise<OfferView> {
    return this.db.withTenant(async (m) => {
      const [offer] = await this.views(m, id);
      if (!offer) {
        throw new NotFoundException('Offer not found.');
      }
      return offer;
    });
  }

  getByApplication(applicationId: string): Promise<OfferView | null> {
    return this.db.withTenant(async (m) => {
      const offer = await m.findOne(Offer, { where: { applicationId } });
      if (!offer) {
        return null;
      }
      const [view] = await this.views(m, offer.id);
      return view ?? null;
    });
  }

  async create(
    user: AuthUser,
    applicationId: string,
    input: CreateOfferInput,
  ): Promise<OfferView> {
    const salary = input.salaryAmount;
    if (typeof salary !== 'number' || Number.isNaN(salary) || salary <= 0) {
      throw new BadRequestException('Salary must be a positive number.');
    }
    if (!input.startDate || Number.isNaN(Date.parse(input.startDate))) {
      throw new BadRequestException('A valid start date is required.');
    }
    const id = await this.db.withTenant(async (m) => {
      const app = await m.findOne(Application, { where: { id: applicationId } });
      if (!app) {
        throw new NotFoundException('Application not found.');
      }
      if (app.status !== 'active') {
        throw new BadRequestException(
          `An offer can only be made on an active application (this one is ${app.status}).`,
        );
      }
      const existing = await m.findOne(Offer, { where: { applicationId } });
      if (existing) {
        throw new BadRequestException('This application already has an offer.');
      }
      const req = await m.findOne(JobRequisition, {
        where: { id: app.requisitionId },
      });
      const entity = await m.findOne(LegalEntity, {
        where: { id: req?.legalEntityId },
      });
      const currency = input.currencyCode?.trim() || entity?.currencyCode;
      if (!currency) {
        throw new BadRequestException('A currency is required.');
      }
      const letterBody = this.renderLetter({
        candidateName: app.candidateName,
        title: req?.title ?? 'the role',
        entityName: entity?.name ?? 'the company',
        salary,
        currency,
        startDate: input.startDate as string,
      });
      const documentHash = createHash('sha256').update(letterBody).digest('hex');
      const offer = await m.save(
        m.create(Offer, {
          tenantId: this.db.tenantId,
          applicationId,
          salaryAmount: salary.toFixed(2),
          currencyCode: currency,
          startDate: input.startDate,
          letterBody,
          documentHash,
          status: 'sent',
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'offer.send',
          resourceType: 'offer',
          resourceId: offer.id,
          after: { salary, currency, hash: documentHash },
        },
        m,
      );
      return offer.id;
    });
    return this.get(id);
  }

  // Click-to-sign: the candidate confirms by typing their name. We bind the
  // signature to the exact letter by re-hashing it, so any later edit breaks the
  // match, and record who signed, when, and from where.
  async sign(id: string, signerName: string, ip: string): Promise<OfferView> {
    const name = signerName?.trim();
    if (!name) {
      throw new BadRequestException('A typed full name is required to sign.');
    }
    await this.db.withTenant(async (m) => {
      const offer = await m.findOne(Offer, { where: { id } });
      if (!offer) {
        throw new NotFoundException('Offer not found.');
      }
      if (offer.status !== 'sent') {
        throw new BadRequestException(
          `Only a sent offer can be signed (this one is ${offer.status}).`,
        );
      }
      const recomputed = createHash('sha256')
        .update(offer.letterBody)
        .digest('hex');
      if (recomputed !== offer.documentHash) {
        throw new BadRequestException(
          'The offer letter has changed since it was sent, so it cannot be signed.',
        );
      }
      offer.status = 'signed';
      offer.signerName = name;
      offer.signedAt = new Date();
      offer.signerIp = ip;
      await m.save(offer);
      await this.audit.record(
        {
          action: 'offer.sign',
          resourceType: 'offer',
          resourceId: offer.id,
          after: { signerName: name, ip, hash: offer.documentHash },
        },
        m,
      );
    });
    return this.get(id);
  }

  async decline(id: string): Promise<OfferView> {
    await this.db.withTenant(async (m) => {
      const offer = await m.findOne(Offer, { where: { id } });
      if (!offer) {
        throw new NotFoundException('Offer not found.');
      }
      if (offer.status !== 'sent') {
        throw new BadRequestException(
          `Only a sent offer can be declined (this one is ${offer.status}).`,
        );
      }
      offer.status = 'declined';
      await m.save(offer);
      await this.audit.record(
        { action: 'offer.decline', resourceType: 'offer', resourceId: offer.id },
        m,
      );
    });
    return this.get(id);
  }

  // Converts a signed offer into an employee record, the start of onboarding
  // (FR-M5-07, FR-M1-10). The candidate becomes an active employee in the
  // requisition's entity and department, and the application is marked hired.
  async convert(user: AuthUser, id: string): Promise<{ employeeId: string }> {
    const prep = await this.db.withTenant(async (m) => {
      const offer = await m.findOne(Offer, { where: { id } });
      if (!offer) {
        throw new NotFoundException('Offer not found.');
      }
      if (offer.status !== 'signed') {
        throw new BadRequestException(
          `Only a signed offer can be converted (this one is ${offer.status}).`,
        );
      }
      if (offer.employeeId) {
        throw new BadRequestException('This offer has already been converted.');
      }
      const app = await m.findOne(Application, {
        where: { id: offer.applicationId },
      });
      const req = await m.findOne(JobRequisition, {
        where: { id: app?.requisitionId },
      });
      if (!app || !req) {
        throw new BadRequestException('The application or requisition is missing.');
      }
      const [{ max }] = (await m.query(
        `SELECT COALESCE(MAX(CAST(substring(employee_code from 'EMP-([0-9]+)$') AS integer)), 0) AS max
           FROM employees WHERE employee_code ~ '^EMP-[0-9]+$'`,
      )) as [{ max: number }];
      const employeeCode = `EMP-${String(Number(max) + 1).padStart(3, '0')}`;
      const [firstName, ...rest] = app.candidateName.trim().split(/\s+/);
      return {
        offer,
        app,
        req,
        employeeCode,
        firstName,
        lastName: rest.join(' ') || firstName,
      };
    });

    // EmployeeService.create runs its own tenant transaction; call it outside
    // the block above, like the expense flow calls the employee service.
    const employee = await this.employees.create({
      legalEntityId: prep.req.legalEntityId,
      employeeCode: prep.employeeCode,
      firstName: prep.firstName,
      lastName: prep.lastName,
      email: prep.app.candidateEmail,
      phone: prep.app.candidatePhone ?? undefined,
      jobTitle: prep.req.title,
      employmentType: prep.req.employmentType as never,
      departmentId: prep.req.departmentId ?? undefined,
      hireDate: prep.offer.startDate,
    });

    await this.db.withTenant(async (m) => {
      const offer = await m.findOne(Offer, { where: { id } });
      const app = await m.findOne(Application, {
        where: { id: prep.app.id },
      });
      if (!offer || !app) {
        return;
      }
      offer.employeeId = employee.id;
      await m.save(offer);
      app.status = 'hired';
      const hired = await m.findOne(PipelineStage, {
        where: { outcome: 'hired' },
      });
      if (hired) {
        app.stageId = hired.id;
      }
      await m.save(app);
      await this.requisitions.markFilledIfComplete(m, app.requisitionId);
      await this.audit.record(
        {
          action: 'offer.convert',
          resourceType: 'offer',
          resourceId: offer.id,
          after: { employeeId: employee.id, employeeCode: prep.employeeCode },
        },
        m,
      );
    });
    return { employeeId: employee.id };
  }

  private renderLetter(input: {
    candidateName: string;
    title: string;
    entityName: string;
    salary: number;
    currency: string;
    startDate: string;
  }): string {
    const amount = input.salary.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return [
      `Dear ${input.candidateName},`,
      '',
      `${input.entityName} is delighted to offer you the position of ${input.title}.`,
      '',
      `Your start date will be ${input.startDate}, with a monthly salary of ` +
        `${amount} ${input.currency}.`,
      '',
      'This offer is contingent on the usual pre-employment checks. To accept, ' +
        'please sign below by typing your full legal name.',
      '',
      'We look forward to welcoming you to the team.',
      '',
      `${input.entityName}`,
    ].join('\n');
  }

  private async views(m: EntityManager, id: string): Promise<OfferView[]> {
    return (await m.query(
      `SELECT o.id,
              o.application_id AS "applicationId",
              a.candidate_name AS "candidateName",
              r.title AS "requisitionTitle",
              o.salary_amount::float AS "salaryAmount",
              o.currency_code AS "currencyCode",
              to_char(o.start_date, 'YYYY-MM-DD') AS "startDate",
              o.letter_body AS "letterBody",
              o.document_hash AS "documentHash",
              o.status,
              o.signer_name AS "signerName",
              to_char(o.signed_at, 'YYYY-MM-DD"T"HH24:MI') AS "signedAt",
              o.signer_ip AS "signerIp",
              o.employee_id AS "employeeId",
              to_char(o.created_at, 'YYYY-MM-DD') AS "createdAt"
         FROM offers o
         JOIN applications a ON a.id = o.application_id
         JOIN job_requisitions r ON r.id = a.requisition_id
        WHERE o.id = $1`,
      [id],
    )) as OfferView[];
  }
}
