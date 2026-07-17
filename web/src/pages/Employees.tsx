import { useCallback, useEffect, useState } from 'react';
import {
  AbsenceRecord,
  ApiError,
  AttendanceSummary,
  CompensationSummary,
  Department,
  Device,
  DeviceHistoryEntry,
  Employee,
  Geofence,
  LeaveRequestRow,
  LegalEntity,
  PayComponent,
  RegularizationRow,
  RosterEntry,
  Shift,
  api,
} from '../api';

// Inclusive date string N days before today, as YYYY-MM-DD.
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Inclusive date string N days after today, as YYYY-MM-DD.
function daysAhead(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const EMPLOYMENT_TYPES = [
  'permanent',
  'contract',
  'probation',
  'intern',
  'consultant',
];
const STATUSES = ['active', 'on_leave', 'terminated'];

type DetailTab =
  | 'devices'
  | 'geofences'
  | 'leave'
  | 'attendance'
  | 'pay'
  | 'privacy';
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'devices', label: 'Devices' },
  { key: 'geofences', label: 'Geofences' },
  { key: 'leave', label: 'Leave' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'pay', label: 'Pay' },
  { key: 'privacy', label: 'Privacy' },
];

export function Employees({ token }: { token: string }) {
  const [list, setList] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const exportAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const csv = await api.exportEmployeesCsv(token);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const csv = await file.text();
      const result = await api.importEmployeesCsv(token, csv);
      setNotice(
        `Import complete: ${result.created} created, ${result.updated} updated` +
          (result.errors.length
            ? `, ${result.errors.length} failed (line ${result.errors
                .map((e) => e.row)
                .join(', ')}).`
            : '.'),
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const selected = list.find((e) => e.id === selectedId) ?? null;

  return (
    <section className="split">
      <div className="master">
        <div className="section-head">
          <h2>Employees</h2>
          <div className="head-actions">
            <button className="btn small-btn" disabled={busy} onClick={() => void exportAll()}>
              Export
            </button>
            <label className="btn small-btn">
              Import
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              className="btn primary small-btn"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? 'Cancel' : 'New'}
            </button>
          </div>
        </div>
        {error && <div className="banner error">{error}</div>}
        {notice && <div className="banner success">{notice}</div>}
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
  const [leave, setLeave] = useState<LeaveRequestRow[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('devices');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, h, g, all, lv, sh, allSh, sum, abs, reg] = await Promise.all([
        api.employeeDevices(token, employee.id),
        api.employeeDeviceHistory(token, employee.id),
        api.employeeGeofences(token, employee.id),
        api.geofences(token),
        api.employeeLeaveRequests(token, employee.id),
        api.employeeShift(token, employee.id),
        api.shifts(token),
        api.employeeSummary(token, employee.id, daysAgo(13), daysAgo(0)),
        api.employeeAbsences(token, employee.id),
        api.employeeRegularizations(token, employee.id),
      ]);
      setDevices(d);
      setHistory(h);
      setAssigned(g);
      setAllFences(all);
      setLeave(lv);
      setShift(sh);
      setAllShifts(allSh);
      setSummary(sum);
      setAbsences(abs);
      setRegularizations(reg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, employee.id]);

  useEffect(() => {
    setEditing(false);
    setDetailTab('devices');
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

  const assignShift = async (shiftId: string) => {
    if (!shiftId) return;
    setBusy(true);
    try {
      await api.assignShift(token, employee.id, shiftId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unassignShift = async () => {
    setBusy(true);
    try {
      await api.unassignShift(token, employee.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reverseAbsence = async (id: string) => {
    setBusy(true);
    try {
      await api.reverseAbsence(token, id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const assignedIds = new Set(assigned.map((g) => g.id));
  const assignable = allFences.filter((g) => !assignedIds.has(g.id));
  const activeShifts = allShifts.filter((s) => s.active);

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

      <div className="filters">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${detailTab === t.key ? 'active' : ''}`}
            onClick={() => setDetailTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'devices' && (
        <>
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
        </>
      )}

      {detailTab === 'geofences' && (
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
      )}

      {detailTab === 'leave' && (
      <div className="card">
        <h3>Leave requests</h3>
        {leave.length === 0 && <p className="muted small">No requests.</p>}
        {leave.map((l) => (
          <div className="line" key={l.id}>
            <span className={`pill status-${l.status ?? 'pending'}`}>
              {l.status ?? 'pending'}
            </span>
            <span className="grow">
              {l.typeName}{' '}
              <span className="muted small">
                {l.startDate} to {l.endDate}
              </span>
            </span>
            <span className="muted small">{l.workingDays} d</span>
          </div>
        ))}
      </div>
      )}

      {detailTab === 'attendance' && (
        <>
      <div className="card">
        <h3>Shift</h3>
        {shift ? (
          <div className="line">
            <span className="grow">
              {shift.name}{' '}
              <span className="muted small">
                {shift.startTime.slice(0, 5)} to {shift.endTime.slice(0, 5)}
              </span>
            </span>
            <button
              className="btn small-btn"
              disabled={busy}
              onClick={() => void unassignShift()}
            >
              Unassign
            </button>
          </div>
        ) : (
          <p className="muted small">No shift assigned.</p>
        )}
        {activeShifts.length > 0 && (
          <div className="assign-row">
            <select
              disabled={busy}
              value=""
              onChange={(e) => void assignShift(e.target.value)}
            >
              <option value="" disabled>
                {shift ? 'Change shift...' : 'Assign a shift...'}
              </option>
              {activeShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <RosterCard
        token={token}
        employeeId={employee.id}
        shifts={activeShifts}
        onError={setError}
      />

      {summary && summary.shift && (
        <div className="card">
          <h3>Attendance (last 14 days)</h3>
          <div className="muted small case-meta">
            present {summary.totals.presentDays} · late{' '}
            {summary.totals.lateDays} · absent {summary.totals.absentDays} ·
            leave {summary.totals.leaveDays} · worked{' '}
            {summary.totals.workedHours} h · overtime{' '}
            {summary.totals.overtimeHours} h
          </div>
          {summary.days
            .filter((d) => d.status !== 'off')
            .map((d) => (
              <div className="line" key={d.day}>
                <span className={`pill day-${d.status}`}>{d.status}</span>
                <span className="grow muted small">{d.day}</span>
                <span className="muted small">
                  {d.workedHours != null ? `${d.workedHours} h` : ''}
                  {d.overtimeHours > 0 ? ` (+${d.overtimeHours} OT)` : ''}
                </span>
              </div>
            ))}
        </div>
      )}

      {absences.length > 0 && (
        <div className="card">
          <h3>Absences</h3>
          {absences.map((a) => (
            <div className="line" key={a.id}>
              <span className={`pill day-${a.reversedAt ? 'leave' : 'absent'}`}>
                {a.reversedAt ? 'reversed' : 'absent'}
              </span>
              <span className="grow">{a.absenceDate}</span>
              {a.reversedAt ? (
                <span className="muted small">{a.reversalReason ?? ''}</span>
              ) : (
                <button
                  className="btn small-btn"
                  disabled={busy}
                  onClick={() => void reverseAbsence(a.id)}
                >
                  Reverse
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <RegularizationsCard
        token={token}
        employeeId={employee.id}
        rows={regularizations}
        onError={setError}
        onChanged={load}
      />
        </>
      )}

      {detailTab === 'pay' && (
        <CompensationCard
          token={token}
          employeeId={employee.id}
          onError={setError}
        />
      )}

      {detailTab === 'privacy' && (
        <PrivacyCard
          token={token}
          employee={employee}
          onError={setError}
          onErased={onUpdated}
        />
      )}
    </div>
  );
}

function PrivacyCard({
  token,
  employee,
  onError,
  onErased,
}: {
  token: string;
  employee: Employee;
  onError: (message: string) => void;
  onErased: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);

  const download = async () => {
    setBusy(true);
    try {
      const bundle = await api.dataExport(token, employee.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `data-export-${employee.employeeCode}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    if (
      !window.confirm(
        `Erase personal data for ${employee.firstName} ${employee.lastName}? This anonymizes their identity. Transactional records are retained under statutory hold.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await api.eraseEmployee(token, employee.id);
      setResult(r.retained);
      await onErased();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const erased = employee.erasedAt != null;

  return (
    <div className="card">
      <h3>Data subject</h3>
      <p className="muted small">
        Export the employee's personal data, or erase their identity on a
        data-subject request. Transactional and audit records are retained under
        the statutory retention hold.
      </p>
      <div className="line">
        <span className="grow">Data export (JSON)</span>
        <button className="btn small-btn" disabled={busy} onClick={() => void download()}>
          Download
        </button>
      </div>
      <div className="line">
        <span className="grow">
          Erase personal data
          {erased && <span className="muted small"> (already erased)</span>}
        </span>
        <button
          className="btn small-btn danger"
          disabled={busy || erased}
          onClick={() => void erase()}
        >
          Erase
        </button>
      </div>
      {result && (
        <p className="muted small">
          Erased. Retained under hold: {result.join(', ')}.
        </p>
      )}
    </div>
  );
}

function RegularizationsCard({
  token,
  employeeId,
  rows,
  onError,
  onChanged,
}: {
  token: string;
  employeeId: string;
  rows: RegularizationRow[];
  onError: (message: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="card">
      <div className="row">
        <h3 className="grow">Regularizations</h3>
        <button className="btn small-btn" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Add correction'}
        </button>
      </div>
      {adding && (
        <AdminRegularizationForm
          token={token}
          employeeId={employeeId}
          onError={onError}
          onDone={async () => {
            setAdding(false);
            await onChanged();
          }}
        />
      )}
      {rows.length === 0 && !adding && (
        <p className="muted small">No regularizations.</p>
      )}
      {rows.map((r) => (
        <div className="line" key={r.id}>
          <span className={`pill status-${r.status}`}>{r.status}</span>
          <span className="grow">
            {r.targetDate}{' '}
            <span className="muted small">{CORRECTION_LABELS[r.correctionType]}</span>
          </span>
          <span className="tag">{r.origin}</span>
        </div>
      ))}
    </div>
  );
}

const CORRECTION_LABELS: Record<string, string> = {
  missing_check_in: 'check-in',
  missing_check_out: 'check-out',
  both: 'check-in and check-out',
};

// Per-date roster admin (T-1E.3): assign a shift to a day or a date range,
// overriding the standing shift for those days. Loads the next 30 days.
// The employee's pay structure (T-2.1). Amounts are in the employee's legal
// entity currency, which the server derives; the form never picks a currency.
function CompensationCard({
  token,
  employeeId,
  onError,
}: {
  token: string;
  employeeId: string;
  onError: (message: string) => void;
}) {
  const [summary, setSummary] = useState<CompensationSummary | null>(null);
  const [catalog, setCatalog] = useState<PayComponent[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ payComponentId: '', amount: '' });

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.employeeCompensation(token, employeeId),
        api.payComponents(token),
      ]);
      setSummary(s);
      setCatalog(c.filter((x) => x.active));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, employeeId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const payComponentId = form.payComponentId || catalog[0]?.id;
    if (!payComponentId) {
      onError('Create a pay component first.');
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount.trim() || Number.isNaN(amount) || amount < 0) {
      onError('Enter an amount of 0 or more.');
      return;
    }
    setBusy(true);
    try {
      setSummary(await api.setCompensation(token, employeeId, {
        payComponentId,
        amount,
      }));
      setForm({ payComponentId: '', amount: '' });
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (payComponentId: string) => {
    setBusy(true);
    try {
      setSummary(await api.removeCompensation(token, employeeId, payComponentId));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!summary) {
    return <p className="muted">Loading...</p>;
  }

  const money = (value: number) =>
    `${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${summary.currencyCode}`;

  return (
    <div className="card">
      <h3>Compensation</h3>
      <div className="muted small case-meta">
        gross {money(summary.gross)} · deductions {money(summary.deductions)} ·
        net {money(summary.net)}
      </div>

      {summary.lines.map((l) => (
        <div className="line" key={l.id}>
          <span className="tag">{l.componentType}</span>
          <span className="grow">{l.name}</span>
          <span className="muted small">
            {l.componentType === 'deduction' ? '-' : ''}
            {money(l.amount)}
          </span>
          <button
            className="btn small-btn"
            disabled={busy}
            onClick={() => void remove(l.payComponentId)}
          >
            Remove
          </button>
        </div>
      ))}
      {summary.lines.length === 0 && (
        <p className="muted small">No pay components set for this employee.</p>
      )}

      <div className="field-row">
        <div className="field">
          <label>Component</label>
          <select
            value={form.payComponentId}
            onChange={(e) =>
              setForm({ ...form, payComponentId: e.target.value })
            }
          >
            <option value="">Select a component</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.componentType})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount ({summary.currencyCode})</label>
          <input
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Set amount
          </button>
        </div>
      </div>
    </div>
  );
}

function RosterCard({
  token,
  employeeId,
  shifts,
  onError,
}: {
  token: string;
  employeeId: string;
  shifts: Shift[];
  onError: (message: string) => void;
}) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [form, setForm] = useState({
    workDate: daysAhead(1),
    from: daysAhead(1),
    to: daysAhead(7),
    shiftId: '',
  });

  const load = useCallback(async () => {
    try {
      setEntries(
        await api.employeeRoster(token, employeeId, daysAgo(0), daysAhead(30)),
      );
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, employeeId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const assign = async () => {
    const shiftId = form.shiftId || shifts[0]?.id;
    if (!shiftId) {
      onError('Create a shift first.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'single') {
        await api.assignRoster(token, employeeId, {
          workDate: form.workDate,
          shiftId,
        });
      } else {
        await api.assignRosterRange(token, employeeId, {
          from: form.from,
          to: form.to,
          shiftId,
        });
      }
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.removeRoster(token, id);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>Roster (next 30 days)</h3>
      {shifts.length === 0 ? (
        <p className="muted small">Create a shift to roster days.</p>
      ) : (
        <div className="form">
          <div className="field-row">
            <div className="field">
              <label>Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'single' | 'range')}
              >
                <option value="single">Single day</option>
                <option value="range">Date range</option>
              </select>
            </div>
            {mode === 'single' ? (
              <div className="field">
                <label>Day</label>
                <input
                  type="date"
                  value={form.workDate}
                  onChange={(e) => set('workDate', e.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <label>From</label>
                  <input
                    type="date"
                    value={form.from}
                    onChange={(e) => set('from', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>To</label>
                  <input
                    type="date"
                    value={form.to}
                    onChange={(e) => set('to', e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label>Shift</label>
              <select
                value={form.shiftId || shifts[0]?.id}
                onChange={(e) => set('shiftId', e.target.value)}
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn" disabled={busy} onClick={() => void assign()}>
            Assign
          </button>
        </div>
      )}
      {entries.length === 0 ? (
        <p className="muted small">No roster entries in the next 30 days.</p>
      ) : (
        entries.map((r) => (
          <div className="line" key={r.id}>
            <span className="grow">
              {r.workDate}{' '}
              <span className="muted small">
                {r.shiftName} {r.startTime.slice(0, 5)} to {r.endTime.slice(0, 5)}
              </span>
            </span>
            {r.source === 'swap' && <span className="tag">swap</span>}
            <button
              className="btn small-btn"
              disabled={busy}
              onClick={() => void remove(r.id)}
            >
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function AdminRegularizationForm({
  token,
  employeeId,
  onDone,
  onError,
}: {
  token: string;
  employeeId: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    targetDate: daysAgo(1),
    correctionType: 'both' as 'missing_check_in' | 'missing_check_out' | 'both',
    checkIn: '09:00',
    checkOut: '17:00',
    reason: '',
  });
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const needsIn = form.correctionType !== 'missing_check_out';
  const needsOut = form.correctionType !== 'missing_check_in';

  const submit = async () => {
    if (!form.reason.trim()) {
      onError('A reason is required for the correction.');
      return;
    }
    setBusy(true);
    try {
      await api.adminRegularization(token, employeeId, {
        targetDate: form.targetDate,
        correctionType: form.correctionType,
        requestedCheckIn: needsIn
          ? `${form.targetDate}T${form.checkIn}:00Z`
          : undefined,
        requestedCheckOut: needsOut
          ? `${form.targetDate}T${form.checkOut}:00Z`
          : undefined,
        reason: form.reason.trim(),
      });
      await onDone();
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
          <label>Date</label>
          <input
            type="date"
            value={form.targetDate}
            onChange={(e) => set('targetDate', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Correction</label>
          <select
            value={form.correctionType}
            onChange={(e) => set('correctionType', e.target.value)}
          >
            <option value="both">Check-in and check-out</option>
            <option value="missing_check_in">Check-in only</option>
            <option value="missing_check_out">Check-out only</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        {needsIn && (
          <div className="field">
            <label>Check-in (UTC)</label>
            <input
              type="time"
              value={form.checkIn}
              onChange={(e) => set('checkIn', e.target.value)}
            />
          </div>
        )}
        {needsOut && (
          <div className="field">
            <label>Check-out (UTC)</label>
            <input
              type="time"
              value={form.checkOut}
              onChange={(e) => set('checkOut', e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="field">
        <label>Reason</label>
        <input
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
        />
      </div>
      <p className="muted small">
        An admin correction is applied immediately with origin admin, not routed
        for approval.
      </p>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Apply correction
        </button>
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
