import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, ApprovalRequest, Decision } from '../api';

const REQUEST_LABELS: Record<string, string> = {
  device_rebind: 'Device change',
};

export function Approvals({ token }: { token: string }) {
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.pendingApprovals(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: Decision) => {
    setBusyId(id);
    setError(null);
    try {
      await api.decide(token, id, decision);
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
        <h2>Pending approvals</h2>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}
      {!loading && items.length === 0 && (
        <p className="muted">Nothing awaiting your approval.</p>
      )}

      <div className="list">
        {items.map((item) => (
          <article className="card row" key={item.id}>
            <div className="grow">
              <div className="row-title">
                <span className="tag">
                  {REQUEST_LABELS[item.requestType] ?? item.requestType}
                </span>
                <span className="muted small">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              <PayloadSummary payload={item.payload} />
            </div>
            <div className="actions">
              <button
                className="btn primary"
                disabled={busyId === item.id}
                onClick={() => void decide(item.id, 'approve')}
              >
                Approve
              </button>
              <button
                className="btn danger"
                disabled={busyId === item.id}
                onClick={() => void decide(item.id, 'reject')}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PayloadSummary({ payload }: { payload?: Record<string, unknown> }) {
  if (!payload) return null;
  // Show the human-relevant fields; hide internal ones.
  const hidden = new Set(['appliedAt', 'newFingerprint']);
  const entries = Object.entries(payload).filter(([k]) => !hidden.has(k));
  if (entries.length === 0) return null;
  return (
    <dl className="payload">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

// Renders a payload value readably, including nested objects (e.g. a profile
// change's { firstName, lastName }) and arrays, which String() would turn into
// "[object Object]".
function formatValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
  }
  return String(value);
}
