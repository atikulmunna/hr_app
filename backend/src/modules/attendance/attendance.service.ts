import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import {
  AttendanceEvent,
  AttendanceEventType,
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
      // 1. Sequence gate (SRS 5.1.1 / FR-AT-04).
      const events = await this.todaysEvents(m, employee.id);
      const state = computeState(events);
      if (!isAllowed(state, input.eventType)) {
        throw new BadRequestException(
          this.sequenceReason(state, input.eventType),
        );
      }

      // Tenant attendance config drives scoring, banding, hard blocks, and the
      // optional marking window (T-1C.12).
      const config = await this.config.effective(m);
      this.assertWithinMarkingWindow(config);

      // Consent gate (FR-M13-01): once a purpose statement is published for the
      // platform, the employee must have accepted its current version.
      await this.consent.assertConsented(m, employee.id, input.platform);

      // 2. Device binding gate (M-DB). Auto-enrolls the first device; a mark
      // from any other device is hard-blocked until an approved re-bind. Runs
      // in this transaction, so enrollment only sticks if the mark succeeds.
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
        fences.length > 0
          ? matchGeofence(input.lat, input.lng, fences)
          : null;
      const geofencePass = fences.length === 0 ? true : matched != null;
      if (!geofencePass && !employee.remoteAllowed) {
        throw new BadRequestException(
          'You are outside a permitted work location.',
        );
      }
      // Recorded outside all fences under the remote-allowed policy (FR-AT-29).
      const remote = !geofencePass && employee.remoteAllowed;

      // 4. Soft-flag scoring (SRS 5.2.2/5.2.4). A device re-bound within the
      // cool-off window adds the newly-re-bound signal (FR-DB-07). A tenant may
      // promote a soft signal to a hard block, which rejects the mark (FR-AT-16).
      // A critical signal forces the Red band regardless of the sum (FR-AT-26).
      const recentlyRebound = await this.devices.wasReboundWithin(m, employee.id);
      const signals = presentSignals(input, recentlyRebound, config);
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
          origin: 'live',
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
          appVersion: input.appVersion,
        }),
      );

      await this.audit.record(
        {
          action: `attendance.${input.eventType}`,
          resourceType: 'attendance_event',
          resourceId: event.id,
          after: { band, riskScore, geofencePass, remote },
        },
        m,
      );

      // Flag the mark for HR review when it lands in the Red band or its
      // high-confidence signals co-occur (FR-AT-10, FR-AT-27).
      if (band === 'red' || hasCoOccurrence(signals, config)) {
        await this.review.openCase(m, {
          employeeId: employee.id,
          eventId: event.id,
          reason: band === 'red' ? 'red_band' : 'co_occurrence',
          signals: highConfidencePresent(signals),
        });
      }
      return event;
    });
  }

  private todaysEvents(
    m: EntityManager,
    employeeId: string,
  ): Promise<AttendanceEvent[]> {
    return m
      .createQueryBuilder(AttendanceEvent, 'e')
      .where('e.employeeId = :employeeId', { employeeId })
      .andWhere("e.serverTs >= date_trunc('day', now())")
      .orderBy('e.serverTs', 'ASC')
      .getMany();
  }

  // Enforces the optional tenant marking window (FR-AT-15). Compared in UTC for
  // now, consistent with the rest of attendance; per-entity timezone lands with
  // the shift/timezone work. Off unless both bounds are configured.
  private assertWithinMarkingWindow(config: RiskConfig): void {
    if (!config.markingStart || !config.markingEnd) {
      return;
    }
    const now = new Date();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
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
