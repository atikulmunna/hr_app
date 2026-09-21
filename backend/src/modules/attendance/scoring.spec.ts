import {
  bandFor,
  computeState,
  DEFAULT_RISK_CONFIG,
  hardBlockedSignal,
  hasCoOccurrence,
  hasCriticalSignal,
  haversineMeters,
  isAllowed,
  matchGeofence,
  presentSignals,
  RiskConfig,
  scoreSignals,
} from './scoring';

const config: RiskConfig = { ...DEFAULT_RISK_CONFIG };

describe('presentSignals', () => {
  it('reports nothing for a clean payload', () => {
    expect(presentSignals({}, false, config)).toEqual([]);
  });

  it('maps each flagged payload field to its signal key', () => {
    const signals = presentSignals(
      {
        rooted: true,
        emulator: true,
        hookingFramework: true,
        appSignatureValid: false,
        adbEnabled: true,
        devOptionsEnabled: true,
        vpnActive: true,
      },
      true,
      config,
    );
    expect(signals).toEqual([
      'rooted',
      'emulator',
      'hooking_framework',
      'signature_mismatch',
      'adb_enabled',
      'dev_options_enabled',
      'vpn_active',
      'recently_rebound',
    ]);
  });

  it('treats an absent signature check as not flagged (null-not-false)', () => {
    expect(presentSignals({ appSignatureValid: undefined }, false, config)).toEqual([]);
    expect(presentSignals({ appSignatureValid: true }, false, config)).toEqual([]);
  });

  it('flags low accuracy only above the tenant limit', () => {
    expect(presentSignals({ accuracyM: 100 }, false, config)).toEqual([]);
    expect(presentSignals({ accuracyM: 100.1 }, false, config)).toEqual(['low_accuracy']);
    expect(
      presentSignals({ accuracyM: 100.1 }, false, { ...config, accuracyLimitM: 200 }),
    ).toEqual([]);
  });

  it('ignores a non-numeric accuracy', () => {
    expect(
      presentSignals({ accuracyM: '500' as unknown as number }, false, config),
    ).toEqual([]);
  });
});

describe('scoreSignals', () => {
  it('sums the default weights', () => {
    expect(scoreSignals(['rooted', 'vpn_active'], config)).toBe(35);
  });

  it('caps at the ceiling', () => {
    expect(
      scoreSignals(['signature_mismatch', 'hooking_framework', 'emulator'], config),
    ).toBe(100);
    expect(
      scoreSignals(['rooted', 'emulator'], { ...config, scoreCeiling: 40 }),
    ).toBe(40);
  });

  it('lets a tenant override one weight without losing the others', () => {
    const tuned = { ...config, weights: { rooted: 5 } };
    expect(scoreSignals(['rooted', 'emulator'], tuned)).toBe(35);
  });

  it('scores an unknown weight as zero', () => {
    const tuned = { ...config, weights: { rooted: undefined as unknown as number } };
    expect(scoreSignals(['rooted'], tuned)).toBe(0);
  });
});

describe('bandFor', () => {
  it('bands on the thresholds, inclusive', () => {
    expect(bandFor(29, false, config)).toBe('clean');
    expect(bandFor(30, false, config)).toBe('yellow');
    expect(bandFor(59, false, config)).toBe('yellow');
    expect(bandFor(60, false, config)).toBe('red');
  });

  it('forces red on a critical signal regardless of score', () => {
    expect(bandFor(0, true, config)).toBe('red');
  });
});

describe('critical, co-occurrence, and hard-block rules', () => {
  it('detects a critical signal from the tenant set', () => {
    expect(hasCriticalSignal(['hooking_framework'], config)).toBe(true);
    expect(hasCriticalSignal(['rooted'], config)).toBe(false);
    expect(
      hasCriticalSignal(['rooted'], { ...config, criticalSignals: ['rooted'] }),
    ).toBe(true);
  });

  it('opens a review case when enough high-confidence signals co-occur', () => {
    expect(hasCoOccurrence(['emulator'], config)).toBe(false);
    expect(hasCoOccurrence(['emulator', 'recently_rebound'], config)).toBe(true);
    // rooted is not high-confidence, so it never counts toward the threshold.
    expect(hasCoOccurrence(['emulator', 'rooted'], config)).toBe(false);
    expect(
      hasCoOccurrence(['emulator'], { ...config, cooccurrenceThreshold: 1 }),
    ).toBe(true);
  });

  it('returns the first hard-blocked signal, or null when none is promoted', () => {
    expect(hardBlockedSignal(['rooted', 'emulator'], config)).toBeNull();
    const strict = { ...config, hardBlockSignals: ['emulator', 'rooted'] };
    expect(hardBlockedSignal(['rooted', 'emulator'], strict)).toBe('rooted');
    expect(hardBlockedSignal(['vpn_active'], strict)).toBeNull();
  });
});

describe('geofencing', () => {
  const office = { id: 'hq', latitude: 23.7275, longitude: 90.39, radiusM: 150 };

  it('measures distance with the haversine formula', () => {
    expect(haversineMeters(0, 0, 0, 0)).toBe(0);
    // One degree of latitude is roughly 111 km.
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111195, -2);
  });

  it('matches a point inside the radius and rejects one outside', () => {
    expect(matchGeofence(23.7275, 90.39, [office])).toBe(office);
    // ~0.001 deg of latitude is ~111 m, inside a 150 m fence.
    expect(matchGeofence(23.7285, 90.39, [office])).toBe(office);
    // ~0.002 deg is ~222 m, outside.
    expect(matchGeofence(23.7295, 90.39, [office])).toBeNull();
    expect(matchGeofence(23.7275, 90.39, [])).toBeNull();
  });

  it('returns the first matching fence', () => {
    const wide = { ...office, id: 'wide', radiusM: 5000 };
    expect(matchGeofence(23.7275, 90.39, [wide, office])).toBe(wide);
  });
});

describe('attendance state machine', () => {
  it('starts not checked in and follows the event sequence', () => {
    expect(computeState([])).toBe('not_checked_in');
    expect(computeState([{ eventType: 'check_in' }])).toBe('checked_in');
    expect(
      computeState([{ eventType: 'check_in' }, { eventType: 'break_start' }]),
    ).toBe('on_break');
    expect(
      computeState([
        { eventType: 'check_in' },
        { eventType: 'break_start' },
        { eventType: 'break_end' },
      ]),
    ).toBe('checked_in');
    expect(
      computeState([{ eventType: 'check_in' }, { eventType: 'check_out' }]),
    ).toBe('checked_out');
  });

  it('only allows the transitions the SRS defines', () => {
    expect(isAllowed('not_checked_in', 'check_in')).toBe(true);
    expect(isAllowed('not_checked_in', 'check_out')).toBe(false);
    expect(isAllowed('checked_in', 'break_start')).toBe(true);
    expect(isAllowed('checked_in', 'check_out')).toBe(true);
    expect(isAllowed('checked_in', 'check_in')).toBe(false);
    expect(isAllowed('on_break', 'break_end')).toBe(true);
    expect(isAllowed('on_break', 'check_out')).toBe(false);
    expect(isAllowed('checked_out', 'check_in')).toBe(false);
  });
});
