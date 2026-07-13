import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  ReviewCase,
  ReviewCaseStatus,
} from '../../entities/review-case.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';

const REVIEW_ROLE = 'hr_admin';
// A pattern escalation fires once an employee reaches this many flagged marks
// within the window (FR-AT-14). Constants for now, tenant-configurable at T-1C.12.
const PATTERN_WINDOW_DAYS = 30;
const PATTERN_MAX = 3;

// Maps an HR decision to the case status it records (FR-AT-12).
const RESOLUTION: Record<string, ReviewCaseStatus> = {
  accept: 'accepted',
  reject: 'rejected',
  adjust: 'adjusted',
};

export interface OpenCaseInput {
  employeeId: string;
  eventId: string;
  reason: string;
  signals: string[];
}

// The queue row: the case joined with its mark and the employee, so HR sees the
// band, score, signals, and location without extra round-trips.
const LIST_SQL = `
  SELECT rc.id AS "id", rc.status, rc.reason, rc.signals,
         rc.created_at AS "createdAt", rc.resolution_note AS "resolutionNote",
         rc.resolved_at AS "resolvedAt",
         e.id AS "eventId", e.event_type AS "eventType", e.server_ts AS "serverTs",
         e.band, e.risk_score AS "riskScore", e.lat, e.lng, e.remote,
         e.geofence_pass AS "geofencePass",
         emp.id AS "employeeId", emp.first_name AS "firstName",
         emp.last_name AS "lastName", emp.employee_code AS "employeeCode"
  FROM review_cases rc
  JOIN attendance_events e ON e.id = rc.event_id
  JOIN employees emp ON emp.id = rc.employee_id
  WHERE ($1::text IS NULL OR rc.status = $1)
  ORDER BY rc.created_at DESC
  LIMIT 100
`;

// Per-employee rolling risk view (FR-AT-13): open and total cases, recent Red
// marks, and the last time they were flagged. Most exposed first.
const RISK_SQL = `
  SELECT emp.id AS "employeeId", emp.first_name AS "firstName",
         emp.last_name AS "lastName", emp.employee_code AS "employeeCode",
         count(*) FILTER (WHERE rc.status = 'open')::int AS "openCases",
         count(*)::int AS "totalCases",
         count(*) FILTER (
           WHERE e.band = 'red'
             AND rc.created_at > now() - make_interval(days => ${PATTERN_WINDOW_DAYS})
         )::int AS "recentRedMarks",
         max(rc.created_at) AS "lastFlaggedAt"
  FROM review_cases rc
  JOIN employees emp ON emp.id = rc.employee_id
  JOIN attendance_events e ON e.id = rc.event_id
  GROUP BY emp.id, emp.first_name, emp.last_name, emp.employee_code
  ORDER BY "openCases" DESC, "lastFlaggedAt" DESC
  LIMIT 50
`;

@Injectable()
export class ReviewService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // Opens a case for a flagged mark, joining the caller's mark transaction so it
  // rolls back with a failed mark. Idempotent per event.
  async openCase(m: EntityManager, input: OpenCaseInput): Promise<void> {
    const existing = await m.findOne(ReviewCase, {
      where: { eventId: input.eventId },
    });
    if (existing) {
      return;
    }
    const created = await m.save(
      m.create(ReviewCase, {
        tenantId: this.db.tenantId,
        employeeId: input.employeeId,
        eventId: input.eventId,
        reason: input.reason,
        signals: input.signals,
      }),
    );
    await this.audit.record(
      {
        action: 'attendance.review_case',
        resourceType: 'review_case',
        resourceId: created.id,
        after: {
          eventId: input.eventId,
          employeeId: input.employeeId,
          reason: input.reason,
          signals: input.signals,
        },
      },
      m,
    );
    await this.notifications.notify(
      {
        recipientRole: REVIEW_ROLE,
        type: 'attendance.review_case',
        title: 'Attendance mark needs review',
        body: this.caseSummary(input),
        data: {
          employeeId: input.employeeId,
          eventId: input.eventId,
          reason: input.reason,
          signals: input.signals,
        },
      },
      m,
    );
    await this.escalateIfPattern(m, input.employeeId);
  }

  list(status?: string): Promise<unknown[]> {
    const filter = status && status !== 'all' ? status : null;
    return this.db.withTenant((m) => m.query(LIST_SQL, [filter]));
  }

  riskView(): Promise<unknown[]> {
    return this.db.withTenant((m) => m.query(RISK_SQL));
  }

  async resolve(
    id: string,
    decision: string,
    note: string | undefined,
    actorSub: string | undefined,
  ): Promise<ReviewCase> {
    const status = RESOLUTION[decision];
    if (!status) {
      throw new BadRequestException(
        'decision must be accept, reject, or adjust.',
      );
    }
    return this.db.withTenant(async (m) => {
      const kase = await m.findOne(ReviewCase, { where: { id } });
      if (!kase) {
        throw new NotFoundException('Review case not found.');
      }
      if (kase.status !== 'open') {
        throw new BadRequestException('This case is already resolved.');
      }
      kase.status = status;
      kase.resolutionNote = note?.trim() || undefined;
      kase.resolvedBy = actorSub;
      kase.resolvedAt = new Date();
      await m.save(kase);
      await this.audit.record(
        {
          action: 'attendance.review_resolve',
          resourceType: 'review_case',
          resourceId: id,
          after: { status, note: kase.resolutionNote },
        },
        m,
      );
      return kase;
    });
  }

  // Escalates when the employee's flagged marks in the window reach the pattern
  // threshold (FR-AT-14). Runs inside the open-case transaction; counts include
  // the case just opened.
  private async escalateIfPattern(
    m: EntityManager,
    employeeId: string,
  ): Promise<void> {
    const rows = await m.query(
      `SELECT count(*)::int AS n FROM review_cases
        WHERE employee_id = $1
          AND created_at > now() - make_interval(days => $2)`,
      [employeeId, PATTERN_WINDOW_DAYS],
    );
    const count: number = rows[0]?.n ?? 0;
    if (count < PATTERN_MAX) {
      return;
    }
    await this.audit.record(
      {
        action: 'attendance.pattern_escalation',
        resourceType: 'employee',
        resourceId: employeeId,
        after: { casesInWindow: count, windowDays: PATTERN_WINDOW_DAYS },
      },
      m,
    );
    await this.notifications.notify(
      {
        recipientRole: REVIEW_ROLE,
        type: 'attendance.pattern_escalation',
        title: 'Repeated attendance flags',
        body: `An employee has ${count} flagged marks in the last ${PATTERN_WINDOW_DAYS} days.`,
        data: { employeeId, casesInWindow: count },
      },
      m,
    );
  }

  private caseSummary(input: OpenCaseInput): string {
    const base =
      input.reason === 'red_band'
        ? 'A mark scored in the Red band.'
        : 'A mark raised multiple high-confidence signals.';
    return input.signals.length
      ? `${base} Signals: ${input.signals.join(', ')}.`
      : base;
  }
}
