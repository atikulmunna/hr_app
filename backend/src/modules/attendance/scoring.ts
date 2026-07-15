import { AttendanceEventType, RiskBand } from '../../entities/attendance-event.entity';

// Canonical soft-flag signal keys. This one vocabulary is shared by weights,
// the critical set, the co-occurrence set, and the hard-block set, so tenant
// config (T-1C.12) refers to signals by a single stable name.
export const SIGNAL_KEYS = [
  'rooted',
  'emulator',
  'hooking_framework',
  'signature_mismatch',
  'adb_enabled',
  'dev_options_enabled',
  'vpn_active',
  'low_accuracy',
  'recently_rebound',
] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

// Recommended default weights (SRS 5.2.2), the ones computable from the payload.
export const DEFAULT_WEIGHTS: Record<SignalKey, number> = {
  rooted: 25,
  emulator: 30,
  hooking_framework: 35,
  signature_mismatch: 40,
  adb_enabled: 10,
  dev_options_enabled: 10,
  vpn_active: 10,
  low_accuracy: 15,
  recently_rebound: 20,
};

// Independent high-confidence signals whose co-occurrence opens a review case
// (FR-AT-27). The set is fixed; the count threshold is tenant-configurable.
export const HIGH_CONFIDENCE_SIGNALS: SignalKey[] = [
  'emulator',
  'hooking_framework',
  'signature_mismatch',
  'recently_rebound',
];

// The tenant-tunable scoring and banding knobs (FR-AT-15, FR-AT-16). Defaults
// match the SRS. The service merges a tenant's stored overrides onto these.
export interface RiskConfig {
  weights: Record<string, number>;
  yellowThreshold: number;
  redThreshold: number;
  scoreCeiling: number;
  accuracyLimitM: number;
  criticalSignals: string[];
  cooccurrenceThreshold: number;
  hardBlockSignals: string[];
  offlineWindowHours: number;
  markingStart: string | null;
  markingEnd: string | null;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  weights: DEFAULT_WEIGHTS,
  yellowThreshold: 30,
  redThreshold: 60,
  scoreCeiling: 100,
  accuracyLimitM: 100,
  criticalSignals: ['hooking_framework', 'signature_mismatch'],
  cooccurrenceThreshold: 2,
  hardBlockSignals: [],
  offlineWindowHours: 12,
  markingStart: null,
  markingEnd: null,
};

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

// The soft-flag signals present on a mark. recentlyRebound is derived
// server-side (a device re-bound within the cool-off window, FR-DB-07); it is
// not a client-supplied payload signal. low_accuracy uses the tenant limit.
export function presentSignals(
  p: SignalPayload,
  recentlyRebound: boolean,
  config: RiskConfig,
): SignalKey[] {
  const present: SignalKey[] = [];
  if (p.rooted) present.push('rooted');
  if (p.emulator) present.push('emulator');
  if (p.hookingFramework) present.push('hooking_framework');
  if (p.appSignatureValid === false) present.push('signature_mismatch');
  if (p.adbEnabled) present.push('adb_enabled');
  if (p.devOptionsEnabled) present.push('dev_options_enabled');
  if (p.vpnActive) present.push('vpn_active');
  if (typeof p.accuracyM === 'number' && p.accuracyM > config.accuracyLimitM) {
    present.push('low_accuracy');
  }
  if (recentlyRebound) present.push('recently_rebound');
  return present;
}

export function scoreSignals(signals: SignalKey[], config: RiskConfig): number {
  const weights = { ...DEFAULT_WEIGHTS, ...config.weights };
  let score = 0;
  for (const s of signals) {
    score += weights[s] ?? 0;
  }
  return Math.min(score, config.scoreCeiling);
}

// A critical signal forces the Red band regardless of the numeric sum
// (FR-AT-26).
export function hasCriticalSignal(
  signals: SignalKey[],
  config: RiskConfig,
): boolean {
  return signals.some((s) => config.criticalSignals.includes(s));
}

export function bandFor(
  score: number,
  critical: boolean,
  config: RiskConfig,
): RiskBand {
  if (critical) return 'red';
  if (score >= config.redThreshold) return 'red';
  if (score >= config.yellowThreshold) return 'yellow';
  return 'clean';
}

export function highConfidencePresent(signals: SignalKey[]): SignalKey[] {
  return signals.filter((s) => HIGH_CONFIDENCE_SIGNALS.includes(s));
}

export function hasCoOccurrence(
  signals: SignalKey[],
  config: RiskConfig,
): boolean {
  return highConfidencePresent(signals).length >= config.cooccurrenceThreshold;
}

// The first present signal a tenant has promoted to a hard block (FR-AT-16),
// or null. A hard-blocked signal rejects the mark rather than scoring it.
export function hardBlockedSignal(
  signals: SignalKey[],
  config: RiskConfig,
): SignalKey | null {
  return signals.find((s) => config.hardBlockSignals.includes(s)) ?? null;
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
