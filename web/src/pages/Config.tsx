import { useCallback, useEffect, useState } from 'react';
import { ApiError, AttendanceConfig, ConsentStatement, api } from '../api';

const CONSENT_SIGNALS = ['location', 'device_integrity', 'network'];

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
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void save()}
        >
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

      <ConsentStatements token={token} />
    </section>
  );
}

function ConsentStatements({ token }: { token: string }) {
  const [statements, setStatements] = useState<ConsentStatement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState('android');
  const [body, setBody] = useState('');
  const [signals, setSignals] = useState<string[]>([...CONSENT_SIGNALS]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatements(await api.consentStatements(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSignal = (s: string) => {
    setSignals((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const publish = async () => {
    if (!body.trim()) {
      setError('A purpose statement body is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.publishConsentStatement(token, {
        platform,
        body: body.trim(),
        signals,
      });
      setBody('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const active = statements.filter((s) => s.active);

  return (
    <div className="card">
      <h3>Consent purpose statement</h3>
      <p className="muted small">
        The plain-language statement an employee accepts before their first
        mark. Publishing a new version supersedes the current one and requires
        everyone to re-consent.
      </p>
      {error && <div className="banner error">{error}</div>}

      {active.length === 0 && (
        <p className="muted small">No active statement published.</p>
      )}
      {active.map((s) => (
        <div className="line" key={s.id}>
          <span className="pill status-approved">
            {s.platform} v{s.version}
          </span>
          <span className="grow">{s.body}</span>
          <span className="muted small">{s.signals.join(', ')}</span>
        </div>
      ))}

      <div className="form" style={{ marginTop: 12 }}>
        <div className="field-row">
          <div className="field">
            <label>Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="android">android</option>
              <option value="ios">ios</option>
            </select>
          </div>
          <div className="field">
            <label>Collected signals</label>
            <div className="filters">
              {CONSENT_SIGNALS.map((s) => (
                <label className="check inline" key={s}>
                  <input
                    type="checkbox"
                    checked={signals.includes(s)}
                    onChange={() => toggleSignal(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <label>Statement</label>
          <textarea
            className="note-input"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="We collect your location and device integrity signals at each check-in to verify on-site presence."
          />
        </div>
        <div className="actions">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void publish()}
          >
            Publish new version
          </button>
        </div>
      </div>
    </div>
  );
}
