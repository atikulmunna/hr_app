import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  CreatePayComponentBody,
  LegalEntity,
  PayComponent,
  PayComponentType,
  api,
} from '../api';

const TYPE_LABELS: Record<PayComponentType, string> = {
  basic: 'Basic',
  allowance: 'Allowance',
  bonus: 'Bonus',
  deduction: 'Deduction',
};

// The tenant's pay component catalog (T-2.1, FR-M4-01). Per-employee amounts are
// set on the employee detail, where the entity currency is known.
export function Payroll({ token }: { token: string }) {
  const [components, setComponents] = useState<PayComponent[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, e] = await Promise.all([
        api.payComponents(token),
        api.entities(token),
      ]);
      setComponents(c);
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

  const toggle = async (c: PayComponent) => {
    setBusyId(c.id);
    setError(null);
    try {
      await api.updatePayComponent(token, c.id, { active: !c.active });
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
        <h2>Entity pay rules</h2>
        <p className="muted small">
          Pay is denominated in each entity's currency. The proration basis
          applies to an incomplete month of work, such as a mid-month joiner or
          leaver.
        </p>
        <div className="list">
          {entities.map((e) => (
            <div className="line" key={e.id}>
              <span className="tag">{e.currencyCode}</span>
              <span className="grow">{e.name}</span>
              <span className="muted small">
                {e.prorationBasis === 'working_days'
                  ? 'prorates by working days'
                  : 'prorates by calendar days'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="section-head">
          <h2>Pay components</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'New component'}
          </button>
        </div>
        <p className="muted small">
          What can appear on a payslip. Amounts are set per employee, in that
          employee's legal entity currency.
        </p>
        {showForm && (
          <NewPayComponentForm
            entities={entities}
            onError={setError}
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
            token={token}
          />
        )}
        <div className="list">
          {components.map((c) => (
            <article className="card row" key={c.id}>
              <div className="grow">
                <div className="row-title">
                  <span className={`pill ${c.active ? 'active' : 'retired'}`}>
                    {c.active ? 'active' : 'inactive'}
                  </span>
                  <span className="tag">{TYPE_LABELS[c.componentType]}</span>
                  <span className="notif-title">{c.name}</span>
                  <span className="muted small">{c.code}</span>
                </div>
                <div className="muted small">
                  {entityName(c.legalEntityId)} ·{' '}
                  {c.taxable ? 'taxable' : 'not taxable'}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  disabled={busyId === c.id}
                  onClick={() => void toggle(c)}
                >
                  {c.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </article>
          ))}
          {components.length === 0 && (
            <p className="muted">No pay components configured.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function NewPayComponentForm({
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
    componentType: 'allowance' as PayComponentType,
    legalEntityId: '',
    taxable: true,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      onError('Code and name are required.');
      return;
    }
    const body: CreatePayComponentBody = {
      code: form.code.trim(),
      name: form.name.trim(),
      componentType: form.componentType,
      legalEntityId: form.legalEntityId || undefined,
      taxable: form.taxable,
    };
    setBusy(true);
    try {
      await api.createPayComponent(token, body);
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
        <div className="field">
          <label>Type</label>
          <select
            value={form.componentType}
            onChange={(e) =>
              setForm({
                ...form,
                componentType: e.target.value as PayComponentType,
                taxable: e.target.value !== 'deduction',
              })
            }
          >
            {(Object.keys(TYPE_LABELS) as PayComponentType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
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
              {ent.name} ({ent.currencyCode})
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.taxable}
          onChange={(e) => setForm({ ...form, taxable: e.target.checked })}
        />
        Taxable
      </label>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create pay component
        </button>
      </div>
    </div>
  );
}
