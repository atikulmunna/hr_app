import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  ReviewCase,
  ReviewDecision,
  RiskRow,
  api,
} from '../api';

const STATUSES = ['open', 'accepted', 'rejected', 'adjusted', 'all'];
const SIGNAL_LABELS: Record<string, string> = {
  signature_mismatch: 'signature mismatch',
  hooking_framework: 'hooking framework',
  emulator: 'emulator',
  recently_rebound: 'recently re-bound',
  impossible_travel: 'impossible travel',
  ip_geo_mismatch: 'IP-geo mismatch',
};

const REASON_LABELS: Record<string, string> = {
  red_band: 'Red band',
  co_occurrence: 'Co-occurring signals',
  enrichment: 'Enrichment',
};

function signalList(signals: string[]): string {
  return signals.map((s) => SIGNAL_LABELS[s] ?? s).join(', ');
}

export function Review({ token }: { token: string }) {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [risk, setRisk] = useState<RiskRow[]>([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, r] = await Promise.all([
        api.reviewCases(token, status),
        api.reviewRisk(token),
      ]);
      setCases(c);
      setRisk(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (
    id: string,
    decision: ReviewDecision,
    note: string,
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await api.resolveReviewCase(token, id, decision, note || undefined);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="section-head">
        <h2>Review queue</h2>
        <div className="filters">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`tab ${status === s ? 'active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      {risk.length > 0 && (
        <div className="card risk">
          <h3>Rolling risk</h3>
          {risk.map((r) => (
            <div className="line" key={r.employeeId}>
              <span className="grow">
                {r.firstName} {r.lastName}{' '}
                <span className="muted small">{r.employeeCode}</span>
              </span>
              <span className="muted small">
                open {r.openCases} · red 30d {r.recentRedMarks} · last{' '}
                {new Date(r.lastFlaggedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="muted">Loading...</p>}
      {!loading && cases.length === 0 && (
        <p className="muted">No {status === 'all' ? '' : status} cases.</p>
      )}

      <div className="list">
        {cases.map((c) => (
          <CaseCard
            key={c.id}
            data={c}
            busy={busyId === c.id}
            onResolve={resolve}
          />
        ))}
      </div>
    </section>
  );
}

function CaseCard({
  data,
  busy,
  onResolve,
}: {
  data: ReviewCase;
  busy: boolean;
  onResolve: (id: string, decision: ReviewDecision, note: string) => void;
}) {
  const [note, setNote] = useState('');
  const open = data.status === 'open';

  return (
    <article className="card">
      <div className="row-title">
        <span className={`pill band-${data.band}`}>{data.band}</span>
        <span className="tag">score {data.riskScore}</span>
        {data.enrichmentStatus === 'pending' && (
          <span className="tag">score pending</span>
        )}
        <span className="notif-title">
          {data.firstName} {data.lastName}
        </span>
        <span className="muted small">{data.employeeCode}</span>
        <span className="spacer" />
        <span className="muted small">
          {data.eventType.replace('_', ' ')} ·{' '}
          {new Date(data.serverTs).toLocaleString()}
        </span>
      </div>

      <div className="muted small case-meta">
        {REASON_LABELS[data.reason] ?? data.reason}
        {data.signals.length > 0 && `: ${signalList(data.signals)}`}
        {data.enrichmentSignals.length > 0 &&
          ` · enrichment: ${signalList(data.enrichmentSignals)}`}
      </div>
      <div className="muted small case-meta">
        {data.remote ? 'remote' : data.geofencePass ? 'inside geofence' : 'outside geofence'}
        {data.lat != null &&
          data.lng != null &&
          ` · ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`}
      </div>

      {open ? (
        <div className="resolve">
          <input
            className="note-input"
            placeholder="Resolution note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => onResolve(data.id, 'accept', note)}
            >
              Accept
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => onResolve(data.id, 'reject', note)}
            >
              Reject
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => onResolve(data.id, 'adjust', note)}
            >
              Adjust
            </button>
          </div>
        </div>
      ) : (
        <div className="muted small case-meta">
          {data.status}
          {data.resolvedAt && ` · ${new Date(data.resolvedAt).toLocaleString()}`}
          {data.resolutionNote && ` · "${data.resolutionNote}"`}
        </div>
      )}
    </article>
  );
}
