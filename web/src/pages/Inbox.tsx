import { useCallback, useEffect, useState } from 'react';
import { ApiError, AppNotification, api } from '../api';

const TYPE_LABELS: Record<string, string> = {
  'device.rebind_abuse': 'Re-bind abuse',
  'attendance.review_case': 'Review case',
  'approval.pending': 'Approval pending',
  'approval.approved': 'Approved',
  'approval.rejected': 'Rejected',
};

export function Inbox({ token }: { token: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.notifications(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.markNotificationRead(token, id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <section>
      <div className="section-head">
        <h2>
          Notifications{unread > 0 && <span className="count">{unread}</span>}
        </h2>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}
      {!loading && items.length === 0 && (
        <p className="muted">No notifications.</p>
      )}

      <div className="list">
        {items.map((n) => (
          <article
            className={`card row ${n.readAt ? '' : 'unread'}`}
            key={n.id}
          >
            <div className="grow">
              <div className="row-title">
                {!n.readAt && <span className="dot" aria-label="unread" />}
                <span className="tag">{TYPE_LABELS[n.type] ?? n.type}</span>
                <span className="muted small">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="notif-title">{n.title}</div>
              {n.body && <div className="muted small">{n.body}</div>}
            </div>
            {!n.readAt && (
              <div className="actions">
                <button
                  className="btn"
                  disabled={busyId === n.id}
                  onClick={() => void markRead(n.id)}
                >
                  Mark read
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
