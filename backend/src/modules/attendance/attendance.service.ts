import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  AttendanceEvent,
  AttendanceEventType,
  AttendanceOrigin,
} from '../../entities/attendance-event.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { DeviceService } from '../devices/device.service';
import { ConsentService } from '../consent/consent.service';
import { GeofenceService } from '../geofences/geofence.service';
import { ReviewService } from '../review/review.service';
import { EmployeeService } from '../employees/employee.service';
import { AttendanceConfigService } from './attendance-config.service';
import {
  AttendanceState,
  RiskConfig,
  SignalKey,
  bandFor,
  computeState,
  hardBlockedSignal,
  hasCoOccurrence,
  hasCriticalSignal,
  highConfidencePresent,
  isAllowed,
  matchGeofence,
  presentSignals,
  scoreSignals,
} from './scoring';

export interface MarkEventInput {
  eventType: AttendanceEventType;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  isMock?: boolean;
  provider?: string;
  wifiBssid?: string;
  ip?: string;
  vpnActive?: boolean;
  rooted?: boolean;
  emulator?: boolean;
  hookingFramework?: boolean;
  adbEnabled?: boolean;
  devOptionsEnabled?: boolean;
  appSignatureValid?: boolean;
  appVersion?: string;
  deviceFingerprint?: string;
  platform?: string;
  deviceModel?: string;
}

// One queued mark synced from the device (T-1C.7). Carries the client capture
// time and an idempotency key on top of the usual signal payload.
export interface OfflineMarkInput extends MarkEventInput {
  clientId?: string;
  capturedAt?: string;
}

export type SyncStatus = 'accepted' | 'duplicate' | 'rejected';

export interface SyncResult {
  clientId: string;
  status: SyncStatus;
  eventId?: string;
  band?: string;
  reason?: string;
}

interface CommitContext {
  at: Date;
  origin: AttendanceOrigin;
  config: RiskConfig;
  extraSignals: SignalKey[];
  enrichmentStatus: 'pending' | 'done';
  clientId?: string;
  syncedAt?: Date;
}

export interface AttendanceToday {
  state: AttendanceState;
  events: AttendanceEvent[];
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
    private readonly devices: DeviceService,
    private readonly geofences: GeofenceService,
    private readonly review: ReviewService,
    private readonly config: AttendanceConfigService,
    private readonly consent: ConsentService,
  ) {}

  async today(user: AuthUser): Promise<AttendanceToday> {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      const events = await this.todaysEvents(m, employee.id);
      return { state: computeState(events), events };
    });
  }

  async mark(user: AuthUser, input: MarkEventInput): Promise<AttendanceEvent> {
    if (!input?.eventType) {
      throw new BadRequestException('eventType is required.');
    }
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.db.withTenant(async (m) => {
      const config = await this.config.effective(m);
      return this.commit(m, employee, input, {
        at: new Date(),
        origin: 'live',
        config,
        extraSignals: [],
        enrichmentStatus: 'pending',
      });
    });
  }

  // Syncs a batch of marks captured offline (T-1C.7). Each event is processed in
  // its own transaction so one rejection does not roll back the rest; results
  // report accepted / duplicate / rejected per event so the device can clear the
  // ones the server has, and keep or surface the rest. Processed oldest-first so
  // the per-day sequence machine sees them in capture order.
  async syncOffline(
    user: AuthUser,
    batch: OfflineMarkInput[],
  ): Promise<SyncResult[]> {
    if (!Array.isArray(batch) || batch.length === 0) {
      throw new BadRequestException('No events to sync.');
    }
    const employee = await this.employees.myProfile(user.sub, user.email);
    const sorted = [...batch].sort((a, b) =>
      (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''),
    );
    const results: SyncResult[] = [];
    for (const item of sorted) {
      const clientId = item.clientId ?? '';
      try {
        results.push(await this.syncOne(employee, item));
      } catch (e) {
        results.push({
          clientId,
          status: 'rejected',
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return results;
  }

  private async syncOne(
    employee: { id: string; remoteAllowed: boolean },
    item: OfflineMarkInput,
  ): Promise<SyncResult> {
    if (!item.clientId) {
      throw new BadRequestException(
        'clientId is required for an offline mark.',
      );
    }
    if (!item.eventType) {
      throw new BadRequestException('eventType is required.');
    }
    if (!item.capturedAt || Number.isNaN(Date.parse(item.capturedAt))) {
      throw new BadRequestException('A valid capturedAt time is required.');
    }
    const captured = new Date(item.capturedAt);
    return this.db.withTenant(async (m) => {
      // Idempotent: a re-synced event never double-inserts (FR-AT-22).
      const existing = await m.findOne(AttendanceEvent, {
        where: { clientId: item.clientId },
      });
      if (existing) {
        return {
          clientId: item.clientId!,
          status: 'duplicate',
          eventId: existing.id,
        };
      }

      const config = await this.config.effective(m);
      // Server-adjusted time (FR-AT-18, FR-AT-20): keep the capture time, but if
      // the client clock is ahead of the server, clamp to now. Flag offline_late
      // when synced past the tenant trust window, or on a clock-ahead (FR-AT-21).
      const now = new Date();
      const extraSignals: SignalKey[] = [];
      let at = captured;
      if (captured.getTime() > now.getTime()) {
        at = now;
        extraSignals.push('offline_late');
      } else {
        const gapHours = (now.getTime() - captured.getTime()) / 3_600_000;
        if (gapHours > config.offlineWindowHours) {
          extraSignals.push('offline_late');
        }
      }

      const event = await this.commit(m, employee, item, {
        at,
        origin: 'offline',
        config,
        extraSignals,
        // Offline marks are scored synchronously from their payload; async
        // enrichment stays a live-mark concern for now.
        enrichmentStatus: 'done',
        clientId: item.clientId,
        syncedAt: now,
      });
      return {
        clientId: item.clientId!,
        status: 'accepted',
        eventId: event.id,
        band: event.band,
      };
    });
  }

  // The shared mark pipeline used by both the live and offline paths: sequence
  // gate, marking window, consent, device binding, hard-block gates, soft-flag
  // scoring, save, audit, and review. ctx carries what differs between the two
  // (time, origin, extra signals, dedup key).
  private async commit(
    m: EntityManager,
    employee: { id: string; remoteAllowed: boolean },
    input: MarkEventInput,
    ctx: CommitContext,
  ): Promise<AttendanceEvent> {
    const { config } = ctx;

    // 1. Sequence gate (SRS 5.1.1 / FR-AT-04), scoped to the mark's own day.
    const events = await this.eventsOnDay(m, employee.id, ctx.at);
    const state = computeState(events);
    if (!isAllowed(state, input.eventType)) {
      throw new BadRequestException(
        this.sequenceReason(state, input.eventType),
      );
    }

    // Optional tenant marking window (T-1C.12), checked against the mark time.
    this.assertWithinMarkingWindow(config, ctx.at);

    // Consent gate (FR-M13-01).
    await this.consent.assertConsented(m, employee.id, input.platform);

    // 2. Device binding gate (M-DB). Auto-enrolls the first device; a mark from
    // any other device is hard-blocked until an approved re-bind. Runs in this
    // transaction, so enrollment only sticks if the mark succeeds.
    const binding = await this.devices.enforceBinding(m, employee.id, {
      deviceFingerprint: input.deviceFingerprint,
      platform: input.platform,
      deviceModel: input.deviceModel,
    });

    // 3. Hard-block gates (SRS 5.2.1).
    if (input.lat == null || input.lng == null) {
      throw new BadRequestException(
        'Location is off or unavailable, so presence cannot be verified.',
      );
    }
    if (input.isMock === true) {
      throw new BadRequestException('A mock location provider was detected.');
    }
    const fences = await this.geofences.effectiveFences(m, employee.id);
    const matched =
      fences.length > 0 ? matchGeofence(input.lat, input.lng, fences) : null;
    const geofencePass = fences.length === 0 ? true : matched != null;
    if (!geofencePass && !employee.remoteAllowed) {
      throw new BadRequestException(
        'You are outside a permitted work location.',
      );
    }
    // Recorded outside all fences under the remote-allowed policy (FR-AT-29).
    const remote = !geofencePass && employee.remoteAllowed;

    // 4. Soft-flag scoring (SRS 5.2.2/5.2.4). Extra signals (e.g. offline_late)
    // are appended to those present in the payload before scoring/banding.
    const recentlyRebound = await this.devices.wasReboundWithin(m, employee.id);
    const signals = [
      ...presentSignals(input, recentlyRebound, config),
      ...ctx.extraSignals,
    ];
    const blocked = hardBlockedSignal(signals, config);
    if (blocked) {
      throw new BadRequestException(
        `A ${blocked.replace(/_/g, ' ')} signal is not permitted for attendance here.`,
      );
    }
    const riskScore = scoreSignals(signals, config);
    const band = bandFor(riskScore, hasCriticalSignal(signals, config), config);

    const event = await m.save(
      m.create(AttendanceEvent, {
        tenantId: this.db.tenantId,
        employeeId: employee.id,
        eventType: input.eventType,
        serverTs: ctx.at,
        origin: ctx.origin,
        deviceId: binding.deviceId,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        isMock: input.isMock,
        provider: input.provider,
        wifiBssid: input.wifiBssid,
        ip: input.ip,
        vpnActive: input.vpnActive,
        rooted: input.rooted,
        emulator: input.emulator,
        hookingFramework: input.hookingFramework,
        adbEnabled: input.adbEnabled,
        devOptionsEnabled: input.devOptionsEnabled,
        appSignatureValid: input.appSignatureValid,
        matchedGeofenceId: matched?.id,
        geofencePass,
        remote,
        riskScore,
        band,
        enrichmentStatus: ctx.enrichmentStatus,
        appVersion: input.appVersion,
        clientId: ctx.clientId,
        syncedAt: ctx.syncedAt,
      }),
    );

    await this.audit.record(
      {
        action: `attendance.${input.eventType}`,
        resourceType: 'attendance_event',
        resourceId: event.id,
        after: { band, riskScore, geofencePass, remote, origin: ctx.origin },
      },
      m,
    );

    // Flag for HR review on a Red band or co-occurring high-confidence signals
    // (FR-AT-10, FR-AT-27).
    if (band === 'red' || hasCoOccurrence(signals, config)) {
      await this.review.openCase(m, {
        employeeId: employee.id,
        eventId: event.id,
        reason: band === 'red' ? 'red_band' : 'co_occurrence',
        signals: highConfidencePresent(signals),
      });
    }
    return event;
  }

  private todaysEvents(
    m: EntityManager,
    employeeId: string,
  ): Promise<AttendanceEvent[]> {
    return this.eventsOnDay(m, employeeId, new Date());
  }

  // The employee's events on the UTC calendar day of `at`, in order. Scoping to
  // the mark's own day lets an offline mark be sequenced against that day rather
  // than today.
  private eventsOnDay(
    m: EntityManager,
    employeeId: string,
    at: Date,
  ): Promise<AttendanceEvent[]> {
    const dayStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    return m
      .createQueryBuilder(AttendanceEvent, 'e')
      .where('e.employeeId = :employeeId', { employeeId })
      .andWhere('e.serverTs >= :dayStart AND e.serverTs < :dayEnd', {
        dayStart,
        dayEnd,
      })
      .orderBy('e.serverTs', 'ASC')
      .getMany();
  }

  // Enforces the optional tenant marking window (FR-AT-15). Compared in UTC for
  // now, consistent with the rest of attendance; per-entity timezone lands with
  // the shift/timezone work. Off unless both bounds are configured.
  private assertWithinMarkingWindow(config: RiskConfig, at: Date): void {
    if (!config.markingStart || !config.markingEnd) {
      return;
    }
    const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
    const [sh, sm] = config.markingStart.split(':');
    const [eh, em] = config.markingEnd.split(':');
    const start = Number(sh) * 60 + Number(sm);
    const end = Number(eh) * 60 + Number(em);
    if (minutes < start || minutes > end) {
      throw new BadRequestException(
        `Attendance can only be marked between ${config.markingStart} and ${config.markingEnd} UTC.`,
      );
    }
  }

  private sequenceReason(
    state: AttendanceState,
    type: AttendanceEventType,
  ): string {
    if (state === 'checked_out') {
      return 'You have already checked out for today.';
    }
    if (type === 'check_in' && state !== 'not_checked_in') {
      return 'You are already checked in.';
    }
    if (type === 'check_out' && state === 'not_checked_in') {
      return 'You need to check in before checking out.';
    }
    return `A ${type.replace('_', ' ')} is not valid right now.`;
  }
}
