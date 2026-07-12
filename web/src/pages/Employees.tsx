import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  Device,
  DeviceHistoryEntry,
  Employee,
  Geofence,
  api,
} from '../api';

export function Employees({ token }: { token: string }) {
  const [list, setList] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .employees(token)
      .then((rows) => {
        if (!active) return;
        setList(rows);
        setSelected((prev) => prev ?? rows[0] ?? null);
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section className="split">
      <div className="master">
        <div className="section-head">
          <h2>Employees</h2>
        </div>
        {error && <div className="banner error">{error}</div>}
        {loading && <p className="muted">Loading...</p>}
        <div className="list">
          {list.map((e) => (
            <button
              key={e.id}
              className={`card employee-row ${selected?.id === e.id ? 'active' : ''}`}
              onClick={() => setSelected(e)}
            >
              <div className="notif-title">
                {e.firstName} {e.lastName}
              </div>
              <div className="muted small">
                {e.jobTitle ?? e.employeeCode} - {e.status}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="detail">
        {selected ? (
          <EmployeeDetail token={token} employee={selected} />
        ) : (
          <p className="muted">Select an employee.</p>
        )}
      </div>
    </section>
  );
}

function EmployeeDetail({
  token,
  employee,
}: {
  token: string;
  employee: Employee;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [history, setHistory] = useState<DeviceHistoryEntry[]>([]);
  const [assigned, setAssigned] = useState<Geofence[]>([]);
  const [allFences, setAllFences] = useState<Geofence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, h, g, all] = await Promise.all([
        api.employeeDevices(token, employee.id),
        api.employeeDeviceHistory(token, employee.id),
        api.employeeGeofences(token, employee.id),
        api.geofences(token),
      ]);
      setDevices(d);
      setHistory(h);
      setAssigned(g);
      setAllFences(all);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, employee.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (geofenceId: string) => {
    if (!geofenceId) return;
    setBusy(true);
    try {
      await api.assignGeofence(token, employee.id, geofenceId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (geofenceId: string) => {
    setBusy(true);
    try {
      await api.unassignGeofence(token, employee.id, geofenceId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const assignedIds = new Set(assigned.map((g) => g.id));
  const assignable = allFences.filter((g) => !assignedIds.has(g.id));

  return (
    <div className="stack">
      <div className="card">
        <div className="notif-title big">
          {employee.firstName} {employee.lastName}
        </div>
        <dl className="payload">
          <div>
            <dt>Code</dt>
            <dd>{employee.employeeCode}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{employee.email ?? '-'}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{employee.employmentType}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{employee.status}</dd>
          </div>
          <div>
            <dt>Remote allowed</dt>
            <dd>{employee.remoteAllowed ? 'yes' : 'no'}</dd>
          </div>
        </dl>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h3>Devices</h3>
        {devices.length === 0 && <p className="muted small">No devices bound.</p>}
        {devices.map((d) => (
          <div className="line" key={d.id}>
            <span className={`pill ${d.status}`}>{d.status}</span>
            <span className="grow">
              {d.platform ?? 'device'} - {d.deviceFingerprint.slice(0, 12)}
            </span>
            <span className="muted small">
              {new Date(d.boundAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Binding history</h3>
        {history.length === 0 && <p className="muted small">No history.</p>}
        {history.map((h) => (
          <div className="line" key={h.id}>
            <span className="tag">{h.action}</span>
            <span className="grow muted small">{h.reasonCode ?? ''}</span>
            <span className="muted small">
              {new Date(h.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Geofences</h3>
        {assigned.length === 0 && (
          <p className="muted small">
            No specific assignment (all tenant fences apply).
          </p>
        )}
        {assigned.map((g) => (
          <div className="line" key={g.id}>
            <span className="grow">
              {g.name} {!g.active && <span className="muted small">(inactive)</span>}
            </span>
            <button
              className="btn small-btn"
              disabled={busy}
              onClick={() => void unassign(g.id)}
            >
              Unassign
            </button>
          </div>
        ))}
        {assignable.length > 0 && (
          <div className="assign-row">
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                void assign(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="" disabled>
                Assign a geofence...
              </option>
              {assignable.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
