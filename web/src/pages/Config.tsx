import { useCallback, useEffect, useState } from 'react';
import { ApiError, AttendanceConfig, api } from '../api';

const SIGNAL_LABELS: Record<string, string> = {
  rooted: 'Rooted device',
  emulator: 'Emulator',
  hooking_framework: 'Hooking framework',
  signature_mismatch: 'App signature mismatch',
  adb_enabled: 'ADB enabled',
  dev_options_enabled: 'Developer options',
  vpn_active: 'VPN active',
  low_accuracy: 'Low GPS accuracy',
  recently_rebound: 'Recently re-bound device',
};

function label(key: string): string {
  return SIGNAL_LABELS[key] ?? key;
}

export function Config({ token }: { token: string }) {
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setConfig(await api.attendanceConfig(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!config) {
    return (
      <section>
        <div className="section-head">
          <h2>Attendance configuration</h2>
        </div>
        {error && <div className="banner error">{error}</div>}
        {!error && <p className="muted">Loading...</p>}
      </section>
    );
  }

  const setNumber = (key: keyof AttendanceConfig, value: string) => {
    const n = Number(value);
    setConfig({ ...config, [key]: Number.isFinite(n) ? n : 0 });
  };
  const setWeight = (signal: string, value: string) => {
    const n = Number(value);
    setConfig({
      ...config,
      weights: { ...config.weights, [signal]: Number.isFinite(n) ? n : 0 },
    });
  };
  const toggle = (
    field: 'criticalSignals' | 'hardBlockSignals',
    signal: string,
  ) => {
    const set = new Set(config[field]);
    if (set.has(signal)) set.delete(signal);
    else set.add(signal);
    setConfig({ ...config, [field]: Array.from(set) });
  };
  const setMarking = (key: 'markingStart' | 'markingEnd', value: string) => {
    setConfig({ ...config, [key]: value || null });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.updateAttendanceConfig(token, config);
      setConfig(saved);
      setNotice('Configuration saved. It applies from the next mark.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Attendance configuration</h2>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>
          Save changes
        </button>
      </div>
      <p className="muted small">
        Scoring and banding rules for this tenant. Changes take effect on the
        next mark, no redeployment.
      </p>

      {error && <div className="banner error">{error}</div>}
      {notice && <div className="banner success">{notice}</div>}

      <div className="card">
        <h3>Signal weights</h3>
        <p className="muted small">
          Points each soft-flag signal adds to a mark's risk score.
        </p>
        <div className="config-grid">
          {Object.keys(config.weights).map((signal) => (
            <div className="field" key={signal}>
              <label>{label(signal)}</label>
              <input
                type="number"
                min={0}
                value={config.weights[signal]}
                onChange={(e) => setWeight(signal, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Bands and limits</h3>
        <div className="config-grid">
          <div className="field">
            <label>Yellow threshold</label>
            <input
              type="number"
              min={0}
              value={config.yellowThreshold}
              onChange={(e) => setNumber('yellowThreshold', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Red threshold</label>
            <input
              type="number"
              min={0}
              value={config.redThreshold}
              onChange={(e) => setNumber('redThreshold', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Score ceiling</label>
            <input
              type="number"
              min={1}
              value={config.scoreCeiling}
              onChange={(e) => setNumber('scoreCeiling', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Accuracy limit (m)</label>
            <input
              type="number"
              min={1}
              value={config.accuracyLimitM}
              onChange={(e) => setNumber('accuracyLimitM', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Co-occurrence count</label>
            <input
              type="number"
              min={1}
              value={config.cooccurrenceThreshold}
              onChange={(e) =>
                setNumber('cooccurrenceThreshold', e.target.value)
              }
            />
          </div>
          <div className="field">
            <label>Offline window (h)</label>
            <input
              type="number"
              min={0}
              value={config.offlineWindowHours}
              onChange={(e) => setNumber('offlineWindowHours', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Signal handling</h3>
        <p className="muted small">
          A critical signal forces the Red band. A hard block rejects the mark
          outright rather than scoring it.
        </p>
        {Object.keys(config.weights).map((signal) => (
          <div className="line" key={signal}>
            <span className="grow">{label(signal)}</span>
            <label className="check inline">
              <input
                type="checkbox"
                checked={config.criticalSignals.includes(signal)}
                onChange={() => toggle('criticalSignals', signal)}
              />
              Critical
            </label>
            <label className="check inline">
              <input
                type="checkbox"
                checked={config.hardBlockSignals.includes(signal)}
                onChange={() => toggle('hardBlockSignals', signal)}
              />
              Hard block
            </label>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Marking window</h3>
        <p className="muted small">
          Optional. When set, marks are only accepted between these times (UTC).
          Leave both empty to allow marking any time.
        </p>
        <div className="config-grid">
          <div className="field">
            <label>Start</label>
            <input
              type="time"
              value={config.markingStart ?? ''}
              onChange={(e) => setMarking('markingStart', e.target.value)}
            />
          </div>
          <div className="field">
            <label>End</label>
            <input
              type="time"
              value={config.markingEnd ?? ''}
              onChange={(e) => setMarking('markingEnd', e.target.value)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
