import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  CreateHolidayBody,
  CreateLeaveTypeBody,
  Holiday,
  LeaveType,
  LegalEntity,
  api,
} from '../api';

export function Leave({ token }: { token: string }) {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showType, setShowType] = useState(false);
  const [showHoliday, setShowHoliday] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, h, e] = await Promise.all([
        api.leaveTypes(token),
        api.holidays(token),
        api.entities(token),
      ]);
      setTypes(t);
      setHolidays(h);
      setEntities(e);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const entityName = (id?: string | null) =>
    id ? (entities.find((e) => e.id === id)?.name ?? 'entity') : 'All entities';

  const toggleType = async (t: LeaveType) => {
    setBusyId(t.id);
    setError(null);
    try {
      await api.updateLeaveType(token, t.id, { active: !t.active });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const removeHoliday = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.deleteHoliday(token, id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="muted">Loading...</p>;
  }

  return (
    <section className="stack">
      {error && <div className="banner error">{error}</div>}

      <div>
        <div className="section-head">
          <h2>Leave types</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setShowType((v) => !v)}
          >
            {showType ? 'Cancel' : 'New type'}
          </button>
        </div>
        {showType && (
          <NewLeaveTypeForm
            entities={entities}
            onError={setError}
            onCreated={() => {
              setShowType(false);
              void load();
            }}
            token={token}
          />
        )}
        <div className="list">
          {types.map((t) => (
            <article className="card row" key={t.id}>
              <div className="grow">
                <div className="row-title">
                  <span className={`pill ${t.active ? 'active' : 'retired'}`}>
                    {t.active ? 'active' : 'inactive'}
                  </span>
                  <span className="notif-title">{t.name}</span>
                  <span className="muted small">{t.code}</span>
                </div>
                <div className="muted small">
                  {entityName(t.legalEntityId)} · quota {Number(t.annualQuota)} d
                  · carry-forward {Number(t.carryForwardCap)} d · notice{' '}
                  {t.noticeDays} d · {t.paid ? 'paid' : 'unpaid'}
                  {t.encashable ? ' · encashable' : ''}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  disabled={busyId === t.id}
                  onClick={() => void toggleType(t)}
                >
                  {t.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </article>
          ))}
          {types.length === 0 && (
            <p className="muted">No leave types configured.</p>
          )}
        </div>
      </div>

      <div>
        <div className="section-head">
          <h2>Holidays</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setShowHoliday((v) => !v)}
          >
            {showHoliday ? 'Cancel' : 'New holiday'}
          </button>
        </div>
        {showHoliday && (
          <NewHolidayForm
            entities={entities}
            onError={setError}
            onCreated={() => {
              setShowHoliday(false);
              void load();
            }}
            token={token}
          />
        )}
        <div className="list">
          {holidays.map((h) => (
            <div className="line" key={h.id}>
              <span className="tag">{h.holidayDate}</span>
              <span className="grow">{h.name}</span>
              <span className="muted small">{entityName(h.legalEntityId)}</span>
              <button
                className="btn small-btn"
                disabled={busyId === h.id}
                onClick={() => void removeHoliday(h.id)}
              >
                Delete
              </button>
            </div>
          ))}
          {holidays.length === 0 && <p className="muted">No holidays yet.</p>}
        </div>
      </div>
    </section>
  );
}

function NewLeaveTypeForm({
  token,
  entities,
  onCreated,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    legalEntityId: '',
    annualQuota: '14',
    carryForwardCap: '0',
    noticeDays: '0',
    paid: true,
    encashable: false,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      onError('Code and name are required.');
      return;
    }
    const body: CreateLeaveTypeBody = {
      code: form.code.trim(),
      name: form.name.trim(),
      legalEntityId: form.legalEntityId || undefined,
      annualQuota: Number(form.annualQuota) || 0,
      carryForwardCap: Number(form.carryForwardCap) || 0,
      noticeDays: Number(form.noticeDays) || 0,
      paid: form.paid,
      encashable: form.encashable,
    };
    setBusy(true);
    try {
      await api.createLeaveType(token, body);
      onCreated();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field">
          <label>Code</label>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Applies to</label>
        <select
          value={form.legalEntityId}
          onChange={(e) => setForm({ ...form, legalEntityId: e.target.value })}
        >
          <option value="">All entities</option>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Annual quota (days)</label>
          <input
            value={form.annualQuota}
            onChange={(e) => setForm({ ...form, annualQuota: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Carry-forward cap</label>
          <input
            value={form.carryForwardCap}
            onChange={(e) =>
              setForm({ ...form, carryForwardCap: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label>Notice (days)</label>
          <input
            value={form.noticeDays}
            onChange={(e) => setForm({ ...form, noticeDays: e.target.value })}
          />
        </div>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.paid}
          onChange={(e) => setForm({ ...form, paid: e.target.checked })}
        />
        Paid leave
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={form.encashable}
          onChange={(e) => setForm({ ...form, encashable: e.target.checked })}
        />
        Encashable
      </label>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create leave type
        </button>
      </div>
    </div>
  );
}

function NewHolidayForm({
  token,
  entities,
  onCreated,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    holidayDate: '',
    name: '',
    legalEntityId: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.holidayDate || !form.name.trim()) {
      onError('Date and name are required.');
      return;
    }
    const body: CreateHolidayBody = {
      holidayDate: form.holidayDate,
      name: form.name.trim(),
      legalEntityId: form.legalEntityId || undefined,
    };
    setBusy(true);
    try {
      await api.createHoliday(token, body);
      onCreated();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field">
          <label>Date</label>
          <input
            type="date"
            value={form.holidayDate}
            onChange={(e) => setForm({ ...form, holidayDate: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Applies to</label>
        <select
          value={form.legalEntityId}
          onChange={(e) => setForm({ ...form, legalEntityId: e.target.value })}
        >
          <option value="">All entities</option>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create holiday
        </button>
      </div>
    </div>
  );
}
