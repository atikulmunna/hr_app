import { useCallback, useEffect, useState } from 'react';
import { ApiError, CreateShiftBody, LegalEntity, Shift, api } from '../api';

export function Shifts({ token }: { token: string }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, e] = await Promise.all([
        api.shifts(token),
        api.entities(token),
      ]);
      setShifts(s);
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

  const toggle = async (s: Shift) => {
    setBusyId(s.id);
    setError(null);
    try {
      await api.updateShift(token, s.id, { active: !s.active });
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
        <h2>Shifts</h2>
        <button className="btn primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New shift'}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {creating && (
        <NewShiftForm
          token={token}
          entities={entities}
          onError={setError}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {loading && <p className="muted">Loading...</p>}
      {!loading && shifts.length === 0 && (
        <p className="muted">No shifts yet.</p>
      )}

      <div className="list">
        {shifts.map((s) => (
          <article className="card row" key={s.id}>
            <div className="grow">
              <div className="row-title">
                <span className={`pill ${s.active ? 'active' : 'retired'}`}>
                  {s.active ? 'active' : 'inactive'}
                </span>
                <span className="notif-title">{s.name}</span>
              </div>
              <div className="muted small">
                {hhmm(s.startTime)} to {hhmm(s.endTime)} · break{' '}
                {s.breakMinutes} min · grace {s.graceMinutes} min ·{' '}
                {entityName(s.legalEntityId)}
              </div>
            </div>
            <div className="actions">
              <button
                className="btn"
                disabled={busyId === s.id}
                onClick={() => void toggle(s)}
              >
                {s.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NewShiftForm({
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
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: '60',
    graceMinutes: '15',
    legalEntityId: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      onError('A shift needs a name.');
      return;
    }
    const body: CreateShiftBody = {
      name: form.name.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: Number(form.breakMinutes) || 0,
      graceMinutes: Number(form.graceMinutes) || 0,
      legalEntityId: form.legalEntityId || undefined,
    };
    setBusy(true);
    try {
      await api.createShift(token, body);
      onCreated();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field">
        <label>Name</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Start</label>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </div>
        <div className="field">
          <label>End</label>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Break (min)</label>
          <input
            value={form.breakMinutes}
            onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Grace (min)</label>
          <input
            value={form.graceMinutes}
            onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Applies to</label>
          <select
            value={form.legalEntityId}
            onChange={(e) =>
              setForm({ ...form, legalEntityId: e.target.value })
            }
          >
            <option value="">All entities</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
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
          Create shift
        </button>
      </div>
    </div>
  );
}

// Shift times come back as HH:MM:SS; show HH:MM.
function hhmm(time: string): string {
  return time.slice(0, 5);
}
