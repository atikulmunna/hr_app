import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  Application,
  ApplicationSource,
} from '../../entities/application.entity';
import { Interview, InterviewMode } from '../../entities/interview.entity';
import {
  InterviewScorecard,
  Recommendation,
} from '../../entities/interview-scorecard.entity';
import { JobRequisition } from '../../entities/job-requisition.entity';
import { PipelineStage } from '../../entities/pipeline-stage.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { RequisitionService } from './requisition.service';
import { StageService } from './stage.service';

const SOURCES: ApplicationSource[] = [
  'referral',
  'job_board',
  'agency',
  'campus',
  'direct',
  'other',
];
const MODES: InterviewMode[] = ['onsite', 'phone', 'video'];
const RECOMMENDATIONS: Recommendation[] = ['strong_yes', 'yes', 'no', 'strong_no'];

export interface CreateApplicationInput {
  requisitionId?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  source?: ApplicationSource;
  referralEmployeeId?: string | null;
}

export interface ScheduleInterviewInput {
  scheduledAt?: string;
  mode?: InterviewMode;
  interviewerName?: string;
  interviewerSub?: string;
}

export interface ScorecardInput {
  rating?: number;
  recommendation?: Recommendation;
  comments?: string;
}

export interface ScorecardView {
  id: string;
  reviewerSub: string;
  reviewerName: string | null;
  rating: number;
  recommendation: string;
  comments: string | null;
  createdAt: string;
}

export interface InterviewView {
  id: string;
  scheduledAt: string;
  mode: string;
  interviewerName: string | null;
  scorecards: ScorecardView[];
}

export interface ApplicationView {
  id: string;
  requisitionId: string;
  requisitionTitle: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  source: string;
  referralEmployeeId: string | null;
  referralName: string | null;
  stageId: string;
  stageName: string;
  status: string;
  hasOffer: boolean;
  offerStatus: string | null;
  createdAt: string;
  interviews?: InterviewView[];
}

// Applications and their interviews (T-3.1, FR-M5-03, FR-M5-05, FR-M5-06). HR
// enters a candidate against an approved requisition; the candidate advances
// through the configurable pipeline, is interviewed with per-reviewer scorecards,
// and is tagged with the channel it came through for yield analysis.
@Injectable()
export class ApplicationService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly stages: StageService,
    private readonly requisitions: RequisitionService,
  ) {}

  listByRequisition(requisitionId: string): Promise<ApplicationView[]> {
    return this.db.withTenant((m) => this.views(m, { requisitionId }));
  }

  get(id: string): Promise<ApplicationView> {
    return this.db.withTenant(async (m) => {
      const [app] = await this.views(m, { id });
      if (!app) {
        throw new NotFoundException('Application not found.');
      }
      app.interviews = await this.interviewViews(m, id);
      return app;
    });
  }

  async create(
    user: AuthUser,
    input: CreateApplicationInput,
  ): Promise<ApplicationView> {
    const name = input.candidateName?.trim();
    const email = input.candidateEmail?.trim();
    if (!input.requisitionId) {
      throw new BadRequestException('An application needs a requisition.');
    }
    if (!name) {
      throw new BadRequestException('A candidate name is required.');
    }
    if (!email) {
      throw new BadRequestException('A candidate email is required.');
    }
    const source = input.source ?? 'direct';
    if (!SOURCES.includes(source)) {
      throw new BadRequestException('Unknown candidate source.');
    }
    if (source !== 'referral' && input.referralEmployeeId) {
      throw new BadRequestException(
        'A referring employee only applies to the referral source.',
      );
    }
    const id = await this.db.withTenant(async (m) => {
      const req = await m.findOne(JobRequisition, {
        where: { id: input.requisitionId },
      });
      if (!req) {
        throw new BadRequestException('Unknown requisition.');
      }
      if (req.status !== 'approved') {
        throw new BadRequestException(
          `Applications can only be added to an approved requisition (this one is ${req.status}).`,
        );
      }
      const stage = await this.stages.firstStage(m);
      const app = await m.save(
        m.create(Application, {
          tenantId: this.db.tenantId,
          requisitionId: req.id,
          candidateName: name,
          candidateEmail: email,
          candidatePhone: input.candidatePhone?.trim() || null,
          source,
          referralEmployeeId: input.referralEmployeeId ?? null,
          stageId: stage.id,
          status: 'active',
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'application.create',
          resourceType: 'application',
          resourceId: app.id,
          after: { candidate: name, source },
        },
        m,
      );
      return app.id;
    });
    return this.get(id);
  }

  async move(id: string, stageId: string): Promise<ApplicationView> {
    if (!stageId) {
      throw new BadRequestException('A target stage is required.');
    }
    await this.db.withTenant(async (m) => {
      const app = await this.activeOrThrow(m, id);
      const stage = await m.findOne(PipelineStage, { where: { id: stageId } });
      if (!stage) {
        throw new BadRequestException('Unknown stage.');
      }
      app.stageId = stage.id;
      // A terminal stage decides the application; its outcome sets the status.
      if (stage.isTerminal && stage.outcome) {
        app.status = stage.outcome === 'hired' ? 'hired' : 'rejected';
      }
      await m.save(app);
      if (app.status === 'hired') {
        await this.requisitions.markFilledIfComplete(m, app.requisitionId);
      }
      await this.audit.record(
        {
          action: 'application.move',
          resourceType: 'application',
          resourceId: app.id,
          after: { stage: stage.name, status: app.status },
        },
        m,
      );
    });
    return this.get(id);
  }

  async reject(id: string): Promise<ApplicationView> {
    await this.db.withTenant(async (m) => {
      const app = await this.activeOrThrow(m, id);
      const rejected = await m.findOne(PipelineStage, {
        where: { outcome: 'rejected' },
      });
      app.status = 'rejected';
      if (rejected) {
        app.stageId = rejected.id;
      }
      await m.save(app);
      await this.audit.record(
        {
          action: 'application.reject',
          resourceType: 'application',
          resourceId: app.id,
        },
        m,
      );
    });
    return this.get(id);
  }

  async scheduleInterview(
    user: AuthUser,
    applicationId: string,
    input: ScheduleInterviewInput,
  ): Promise<ApplicationView> {
    if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) {
      throw new BadRequestException('A valid interview date and time is required.');
    }
    const mode = input.mode ?? 'video';
    if (!MODES.includes(mode)) {
      throw new BadRequestException('Interview mode must be onsite, phone, or video.');
    }
    await this.db.withTenant(async (m) => {
      const app = await this.activeOrThrow(m, applicationId);
      await m.save(
        m.create(Interview, {
          tenantId: this.db.tenantId,
          applicationId: app.id,
          scheduledAt: new Date(input.scheduledAt as string),
          mode,
          interviewerSub: input.interviewerSub ?? null,
          interviewerName: input.interviewerName?.trim() || null,
          createdBySub: user.sub,
        }),
      );
      await this.audit.record(
        {
          action: 'interview.schedule',
          resourceType: 'application',
          resourceId: app.id,
          after: { scheduledAt: input.scheduledAt, mode },
        },
        m,
      );
    });
    return this.get(applicationId);
  }

  // A reviewer's scorecard. Upsert on (interview, reviewer): a reviewer editing
  // their own card replaces it rather than adding a second (FR-M5-05).
  async addScorecard(
    user: AuthUser,
    interviewId: string,
    input: ScorecardInput,
  ): Promise<ApplicationView> {
    const rating = input.rating;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be a whole number from 1 to 5.');
    }
    if (!input.recommendation || !RECOMMENDATIONS.includes(input.recommendation)) {
      throw new BadRequestException(
        'Recommendation must be strong_yes, yes, no, or strong_no.',
      );
    }
    const applicationId = await this.db.withTenant(async (m) => {
      const interview = await m.findOne(Interview, { where: { id: interviewId } });
      if (!interview) {
        throw new NotFoundException('Interview not found.');
      }
      const existing = await m.findOne(InterviewScorecard, {
        where: { interviewId, reviewerSub: user.sub },
      });
      if (existing) {
        existing.rating = rating;
        existing.recommendation = input.recommendation as Recommendation;
        existing.comments = input.comments?.trim() || null;
        await m.save(existing);
      } else {
        await m.save(
          m.create(InterviewScorecard, {
            tenantId: this.db.tenantId,
            interviewId,
            reviewerSub: user.sub,
            reviewerName: user.username ?? user.email ?? null,
            rating,
            recommendation: input.recommendation as Recommendation,
            comments: input.comments?.trim() || null,
          }),
        );
      }
      return interview.applicationId;
    });
    return this.get(applicationId);
  }

  private async activeOrThrow(
    m: EntityManager,
    id: string,
  ): Promise<Application> {
    const app = await m.findOne(Application, { where: { id } });
    if (!app) {
      throw new NotFoundException('Application not found.');
    }
    if (app.status !== 'active') {
      throw new BadRequestException(
        `This application is ${app.status}, so it cannot be changed.`,
      );
    }
    return app;
  }

  private async views(
    m: EntityManager,
    where: { id?: string; requisitionId?: string },
  ): Promise<ApplicationView[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (where.id) {
      params.push(where.id);
      clauses.push(`a.id = $${params.length}`);
    }
    if (where.requisitionId) {
      params.push(where.requisitionId);
      clauses.push(`a.requisition_id = $${params.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return (await m.query(
      `SELECT a.id,
              a.requisition_id AS "requisitionId",
              r.title AS "requisitionTitle",
              a.candidate_name AS "candidateName",
              a.candidate_email AS "candidateEmail",
              a.candidate_phone AS "candidatePhone",
              a.source,
              a.referral_employee_id AS "referralEmployeeId",
              CASE WHEN ref.id IS NULL THEN NULL
                   ELSE ref.first_name || ' ' || ref.last_name END AS "referralName",
              a.stage_id AS "stageId",
              s.name AS "stageName",
              a.status,
              (o.id IS NOT NULL) AS "hasOffer",
              o.status AS "offerStatus",
              to_char(a.created_at, 'YYYY-MM-DD') AS "createdAt"
         FROM applications a
         JOIN job_requisitions r ON r.id = a.requisition_id
         JOIN pipeline_stages s ON s.id = a.stage_id
         LEFT JOIN employees ref ON ref.id = a.referral_employee_id
         LEFT JOIN offers o ON o.application_id = a.id
         ${filter}
        ORDER BY a.created_at DESC`,
      params,
    )) as ApplicationView[];
  }

  private async interviewViews(
    m: EntityManager,
    applicationId: string,
  ): Promise<InterviewView[]> {
    const interviews = (await m.query(
      `SELECT id,
              to_char(scheduled_at, 'YYYY-MM-DD"T"HH24:MI') AS "scheduledAt",
              mode,
              interviewer_name AS "interviewerName"
         FROM interviews
        WHERE application_id = $1
        ORDER BY scheduled_at ASC`,
      [applicationId],
    )) as Omit<InterviewView, 'scorecards'>[];
    if (interviews.length === 0) {
      return [];
    }
    const ids = interviews.map((i) => i.id);
    const cards = (await m.query(
      `SELECT id,
              interview_id AS "interviewId",
              reviewer_sub AS "reviewerSub",
              reviewer_name AS "reviewerName",
              rating,
              recommendation,
              comments,
              to_char(created_at, 'YYYY-MM-DD') AS "createdAt"
         FROM interview_scorecards
        WHERE interview_id = ANY($1)
        ORDER BY created_at ASC`,
      [ids],
    )) as (ScorecardView & { interviewId: string })[];
    const byInterview = new Map<string, ScorecardView[]>();
    for (const card of cards) {
      const { interviewId, ...view } = card;
      const list = byInterview.get(interviewId) ?? [];
      list.push(view);
      byInterview.set(interviewId, list);
    }
    return interviews.map((i) => ({
      ...i,
      scorecards: byInterview.get(i.id) ?? [],
    }));
  }
}
