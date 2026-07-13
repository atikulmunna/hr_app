import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  Department,
  Device,
  DeviceHistoryEntry,
  Employee,
  Geofence,
  LegalEntity,
  api,
} from '../api';

const EMPLOYMENT_TYPES = [
  'permanent',
  'contract',
  'probation',
  'intern',
  'consultant',
];
const STATUSES = ['active', 'on_leave', 'terminated'];

export function Employees({ token }: { token: string }) {
  const [list, setList] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api.employees(token);
      setList(rows);
      setSelectedId((prev) =>
        prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = list.find((e) => e.id === selectedId) ?? null;

  return (
    <section className="split">
      <div className="master">
        <div className="section-head">
          <h2>Employees</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? 'Cancel' : 'New'}
          </button>
        </div>
        {error && <div className="banner error">{error}</div>}
        {loading && <p className="muted">Loading...</p>}
        <div className="list">
          {list.map((e) => (
            <button
              key={e.id}
              className={`card employee-row ${
                selectedId === e.id ? 'active' : ''
              }`}
              onClick={() => {
                setCreating(false);
                setSelectedId(e.id);
              }}
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
        {creating ? (
          <NewEmployeeForm
            token={token}
            onError={setError}
            onCreated={(created) => {
              setCreating(false);
              setSelectedId(created.id);
              void load();
            }}
          />
        ) : selected ? (
          <EmployeeDetail token={token} employee={selected} onUpdated={load} />
        ) : (
          <p className="muted">Select an employee.</p>
        )}
      </div>
    </section>
  );
}

function NewEmployeeForm({
  token,
  onCreated,
  onError,
}: {
  token: string;
  onCreated: (created: Employee) => void;
  onError: (message: string) => void;
}) {
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState({
    legalEntityId: '',
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    jobTitle: '',
    employmentType: 'permanent',
    departmentId: '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.entities(token), api.departments(token)])
      .then(([ents, depts]) => {
        setEntities(ents);
        setDepartments(depts);
        setForm((f) => ({ ...f, legalEntityId: ents[0]?.id ?? '' }));
      })
      .catch((e) => onError(e instanceof ApiError ? e.message : String(e)));
  }, [token, onError]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const deptOptions = departments.filter(
    (d) => d.legalEntityId === form.legalEntityId,
  );

  const submit = async () => {
    if (
      !form.legalEntityId ||
      !form.employeeCode.trim() ||
      !form.firstName.trim() ||
      !form.lastName.trim()
    ) {
      onError('Legal entity, code, first name, and last name are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.createEmployee(token, {
        legalEntityId: form.legalEntityId,
        employeeCode: form.employeeCode.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        employmentType: form.employmentType,
        departmentId: form.departmentId || undefined,
      });
      onCreated(created);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="notif-title big">New employee</div>
      <div className="field">
        <label>Legal entity</label>
        <select
          value={form.legalEntityId}
          onChange={(e) => set('legalEntityId', e.target.value)}
        >
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Employee code</label>
          <input
            value={form.employeeCode}
            onChange={(e) => set('employeeCode', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Employment type</label>
          <select
            value={form.employmentType}
            onChange={(e) => set('employmentType', e.target.value)}
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>First name</label>
          <input
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Last name</label>
          <input
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Email</label>
        <input value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Job title</label>
          <input
            value={form.jobTitle}
            onChange={(e) => set('jobTitle', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Department</label>
          <select
            value={form.departmentId}
            onChange={(e) => set('departmentId', e.target.value)}
          >
            <option value="">None</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create employee
        </button>
      </div>
    </div>
  );
}

function EmployeeDetail({
  token,
  employee,
  onUpdated,
}: {
  token: string;
  employee: Employee;
  onUpdated: () => Promise<void>;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [history, setHistory] = useState<DeviceHistoryEntry[]>([]);
  const [assigned, setAssigned] = useState<Geofence[]>([]);
  const [allFences, setAllFences] = useState<Geofence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

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
    setEditing(false);
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
        <div className="row">
          <div className="notif-title big grow">
            {employee.firstName} {employee.lastName}
          </div>
          <button
            className="btn small-btn"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        </div>
        {editing ? (
          <EditEmployeeForm
            token={token}
            employee={employee}
            onError={setError}
            onSaved={async () => {
              setEditing(false);
              await onUpdated();
            }}
          />
        ) : (
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
              <dt>Job title</dt>
              <dd>{employee.jobTitle ?? '-'}</dd>
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
        )}
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

function EditEmployeeForm({
  token,
  employee,
  onSaved,
  onError,
}: {
  token: string;
  employee: Employee;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email ?? '',
    jobTitle: employee.jobTitle ?? '',
    employmentType: employee.employmentType,
    status: employee.status,
    remoteAllowed: employee.remoteAllowed,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      onError('First and last name are required.');
      return;
    }
    setBusy(true);
    try {
      await api.updateEmployee(token, employee.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        employmentType: form.employmentType,
        status: form.status,
        remoteAllowed: form.remoteAllowed,
      });
      await onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form">
      <div className="field-row">
        <div className="field">
          <label>First name</label>
          <input
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Last name</label>
          <input
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Email</label>
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Job title</label>
        <input
          value={form.jobTitle}
          onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Employment type</label>
          <select
            value={form.employmentType}
            onChange={(e) =>
              setForm({ ...form, employmentType: e.target.value })
            }
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.remoteAllowed}
          onChange={(e) =>
            setForm({ ...form, remoteAllowed: e.target.checked })
          }
        />
        Remote attendance allowed
      </label>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
