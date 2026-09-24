import { useCallback, useEffect, useState } from 'react';
import { AppNotification, api } from '../api';
import { errorMessage } from '../lib/errors';

const TYPE_LABELS: Record<string, string> = {
  'device.rebind_abuse': 'Re-bind abuse',
  'attendance.review_case': 'Review case',
  'approval.pending': 'Approval pending',
  'approval.approved': 'Approved',
  'approval.rejected': 'Rejected',
};

// How many notifications to fetch at a time. An inbox only grows, so the page
// is read in windows and extended on demand rather than loaded whole.
const PAGE_SIZE = 50;

export function Inbox({ token }: { token: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reloads from the start, keeping however many pages are already on screen so
  // marking one read does not collapse the list back to the first page.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const size = Math.max(items.length, PAGE_SIZE);
      const page = await api.notifications(token, size, 0);
      setItems(page.items);
      setTotal(page.total);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // items is read to size the refresh, but changing it must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.notifications(token, PAGE_SIZE, items.length);
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

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
      setError(errorMessage(e));
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
        <div className="head-actions">
          {total > 0 && (
            <span className="muted small">
              {items.length} of {total}
            </span>
          )}
          <button
            className="btn"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
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

      {items.length < total && (
        <div className="actions">
          <button
            className="btn"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : `Load ${PAGE_SIZE} more`}
          </button>
        </div>
      )}
    </section>
  );
}
