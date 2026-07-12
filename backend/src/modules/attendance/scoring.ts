import { AttendanceEventType, RiskBand } from '../../entities/attendance-event.entity';

// Soft-flag weights (SRS 5.2.2 defaults, the ones computable from the payload).
const WEIGHTS = {
  rooted: 25,
  emulator: 30,
  hookingFramework: 35,
  appSignatureInvalid: 40,
  adbEnabled: 10,
  devOptionsEnabled: 10,
  vpnActive: 10,
  lowAccuracy: 15,
};
const SCORE_CEILING = 100;

export interface SignalPayload {
  isMock?: boolean;
  accuracyM?: number;
  rooted?: boolean;
  emulator?: boolean;
  hookingFramework?: boolean;
  adbEnabled?: boolean;
  devOptionsEnabled?: boolean;
  appSignatureValid?: boolean;
  vpnActive?: boolean;
}

export function scoreSoftFlags(p: SignalPayload): number {
  let score = 0;
  if (p.rooted) score += WEIGHTS.rooted;
  if (p.emulator) score += WEIGHTS.emulator;
  if (p.hookingFramework) score += WEIGHTS.hookingFramework;
  if (p.appSignatureValid === false) score += WEIGHTS.appSignatureInvalid;
  if (p.adbEnabled) score += WEIGHTS.adbEnabled;
  if (p.devOptionsEnabled) score += WEIGHTS.devOptionsEnabled;
  if (p.vpnActive) score += WEIGHTS.vpnActive;
  if (typeof p.accuracyM === 'number' && p.accuracyM > 100) {
    score += WEIGHTS.lowAccuracy;
  }
  return Math.min(score, SCORE_CEILING);
}

export function bandFor(score: number): RiskBand {
  if (score >= 60) return 'red';
  if (score >= 30) return 'yellow';
  return 'clean';
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GeofenceLike {
  id: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export function matchGeofence(
  lat: number,
  lng: number,
  fences: GeofenceLike[],
): GeofenceLike | null {
  for (const f of fences) {
    if (haversineMeters(lat, lng, f.latitude, f.longitude) <= f.radiusM) {
      return f;
    }
  }
  return null;
}

// Event-sequence state machine (SRS 5.1.1).
export type AttendanceState =
  | 'not_checked_in'
  | 'checked_in'
  | 'on_break'
  | 'checked_out';

export function computeState(
  events: { eventType: AttendanceEventType }[],
): AttendanceState {
  let state: AttendanceState = 'not_checked_in';
  for (const e of events) {
    switch (e.eventType) {
      case 'check_in':
        state = 'checked_in';
        break;
      case 'break_start':
        state = 'on_break';
        break;
      case 'break_end':
        state = 'checked_in';
        break;
      case 'check_out':
        state = 'checked_out';
        break;
    }
  }
  return state;
}

const ALLOWED: Record<AttendanceState, AttendanceEventType[]> = {
  not_checked_in: ['check_in'],
  checked_in: ['break_start', 'check_out'],
  on_break: ['break_end'],
  checked_out: [],
};

export function isAllowed(
  state: AttendanceState,
  type: AttendanceEventType,
): boolean {
  return ALLOWED[state].includes(type);
}
