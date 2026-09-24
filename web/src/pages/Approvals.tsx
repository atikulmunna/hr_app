import { useCallback } from 'react';
import { api, ApprovalRequest, Decision } from '../api';
import { useMutation, useRequest } from '../lib/useRequest';

const REQUEST_LABELS: Record<string, string> = {
  device_rebind: 'Device change',
};

export function Approvals({ token }: { token: string }) {
  const fetchPending = useCallback(() => api.pendingApprovals(token), [token]);
  const {
    data: items = [],
    error,
    loading,
    reload,
    setError,
  } = useRequest<ApprovalRequest[]>(fetchPending);
  const { run, isBusy } = useMutation(setError);

  const decide = (id: string, decision: Decision) =>
    run(id, async () => {
      await api.decide(token, id, decision);
      await reload();
    });

  return (
    <section>
      <div className="section-head">
        <h2>Pending approvals</h2>
        <button
          className="btn"
          onClick={() => void reload()}
          disabled={loading}
        >
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
                disabled={isBusy(item.id)}
                onClick={() => void decide(item.id, 'approve')}
              >
                Approve
              </button>
              <button
                className="btn danger"
                disabled={isBusy(item.id)}
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
