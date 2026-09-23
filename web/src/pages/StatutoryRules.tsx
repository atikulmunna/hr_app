import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  CreateStatutoryRuleBody,
  LegalEntity,
  StatutoryCalculation,
  StatutoryRule,
  api,
} from '../api';

// Statutory deductions per jurisdiction (T-2.3, FR-M4-06). Rates are law and
// change most years, so a rule is effective-dated: adding a later one supersedes
// rather than editing in place, and a run keeps using what was in force at its
// cut-off.
export function StatutoryRules({
  token,
  entities,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  onError: (message: string) => void;
}) {
  const [rules, setRules] = useState<StatutoryRule[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setRules(await api.statutoryRules(token));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const entityName = (id: string) =>
    entities.find((e) => e.id === id)?.name ?? 'entity';

  const toggle = async (rule: StatutoryRule) => {
    setBusyId(rule.id);
    try {
      await api.setStatutoryRuleActive(token, rule.id, !rule.active);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await api.deleteStatutoryRule(token, id);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const describe = (r: StatutoryRule) => {
    const per = r.basis === 'annual' ? ', annual figures' : '';
    if (r.calculation === 'bracket') {
      return `progressive on ${r.base}${per}: ${r.brackets
        .map(
          (b) =>
            `${b.lowerBound}${b.upperBound == null ? '+' : ` to ${b.upperBound}`} @ ${b.rate}%`,
        )
        .join(', ')}`;
    }
    const ceiling = r.wageCeiling
      ? ` (capped at ${Number(r.wageCeiling)})`
      : '';
    return `${Number(r.employeeRate)}% employee, ${Number(r.employerRate)}% employer on ${r.base}${ceiling}${per}`;
  };

  return (
    <div>
      <div className="section-head">
        <h2>Statutory deductions</h2>
        <button
          className="btn primary small-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'New rule'}
        </button>
      </div>
      <p className="muted small">
        Tax, provident fund, and contributions, per legal entity. Rates are
        dated: add a rule with a later date to supersede an old one. A run
        applies what was in force at its cut-off, so changing a rate never
        rewrites a past period. Employee amounts reduce net pay; employer
        amounts are a cost and do not. Set "annual figures" for income tax so
        its yearly brackets are annualized against monthly pay; keep "monthly"
        for provident fund and CPF-style contributions.
      </p>

      {showForm && (
        <NewStatutoryRuleForm
          token={token}
          entities={entities}
          onError={onError}
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      <div className="list">
        {rules.map((r) => (
          <article className="card row" key={r.id}>
            <div className="grow">
              <div className="row-title">
                <span className={`pill ${r.active ? 'active' : 'retired'}`}>
                  {r.active ? 'active' : 'inactive'}
                </span>
                <span className="tag">{r.calculation}</span>
                <span className="notif-title">{r.name}</span>
                <span className="muted small">{r.code}</span>
              </div>
              <div className="muted small">
                {entityName(r.legalEntityId)} · from {r.effectiveFrom} ·{' '}
                {describe(r)}
              </div>
            </div>
            <div className="actions">
              <button
                className="btn"
                disabled={busyId === r.id}
                onClick={() => void toggle(r)}
              >
                {r.active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                className="btn danger"
                disabled={busyId === r.id}
                onClick={() => void remove(r.id)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {rules.length === 0 && (
          <p className="muted">No statutory rules configured.</p>
        )}
      </div>
    </div>
  );
}

function NewStatutoryRuleForm({
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
    legalEntityId: '',
    code: '',
    name: '',
    calculation: 'percentage' as StatutoryCalculation,
    base: 'gross' as 'basic' | 'gross',
    basis: 'monthly' as 'monthly' | 'annual',
    employeeRate: '',
    employerRate: '',
    wageCeiling: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const [brackets, setBrackets] = useState([
    { lowerBound: '0', upperBound: '', rate: '0' },
  ]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const legalEntityId = form.legalEntityId || entities[0]?.id;
    if (!legalEntityId || !form.code.trim() || !form.name.trim()) {
      onError('Entity, code, and name are required.');
      return;
    }
    const body: CreateStatutoryRuleBody = {
      legalEntityId,
      code: form.code.trim(),
      name: form.name.trim(),
      calculation: form.calculation,
      base: form.base,
      basis: form.basis,
      effectiveFrom: form.effectiveFrom,
    };
    if (form.calculation === 'percentage') {
      body.employeeRate = Number(form.employeeRate) || 0;
      body.employerRate = Number(form.employerRate) || 0;
      body.wageCeiling = form.wageCeiling.trim()
        ? Number(form.wageCeiling)
        : null;
    } else {
      body.brackets = brackets.map((b) => ({
        lowerBound: Number(b.lowerBound) || 0,
        upperBound: b.upperBound.trim() ? Number(b.upperBound) : null,
        rate: Number(b.rate) || 0,
      }));
    }
    setBusy(true);
    try {
      await api.createStatutoryRule(token, body);
      onCreated();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setBracket = (i: number, key: string, value: string) =>
    setBrackets((bs) =>
      bs.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)),
    );

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field">
          <label>Legal entity</label>
          <select
            value={form.legalEntityId}
            onChange={(e) =>
              setForm({ ...form, legalEntityId: e.target.value })
            }
          >
            <option value="">Select an entity</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name} ({ent.currencyCode})
              </option>
            ))}
          </select>
        </div>
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

      <div className="field-row">
        <div className="field">
          <label>Calculation</label>
          <select
            value={form.calculation}
            onChange={(e) =>
              setForm({
                ...form,
                calculation: e.target.value as StatutoryCalculation,
              })
            }
          >
            <option value="percentage">Percentage of pay</option>
            <option value="bracket">Progressive brackets</option>
          </select>
        </div>
        <div className="field">
          <label>Applies to</label>
          <select
            value={form.base}
            onChange={(e) =>
              setForm({ ...form, base: e.target.value as 'basic' | 'gross' })
            }
          >
            <option value="gross">Gross pay</option>
            <option value="basic">Basic only</option>
          </select>
        </div>
        <div className="field">
          <label>Thresholds are</label>
          <select
            value={form.basis}
            onChange={(e) =>
              setForm({
                ...form,
                basis: e.target.value as 'monthly' | 'annual',
              })
            }
          >
            <option value="monthly">Monthly figures</option>
            <option value="annual">Annual figures</option>
          </select>
        </div>
        <div className="field">
          <label>Effective from</label>
          <input
            type="date"
            value={form.effectiveFrom}
            onChange={(e) =>
              setForm({ ...form, effectiveFrom: e.target.value })
            }
          />
        </div>
      </div>

      {form.calculation === 'percentage' ? (
        <div className="field-row">
          <div className="field">
            <label>Employee rate (%)</label>
            <input
              value={form.employeeRate}
              onChange={(e) =>
                setForm({ ...form, employeeRate: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Employer rate (%)</label>
            <input
              value={form.employerRate}
              onChange={(e) =>
                setForm({ ...form, employerRate: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Wage ceiling (optional)</label>
            <input
              value={form.wageCeiling}
              onChange={(e) =>
                setForm({ ...form, wageCeiling: e.target.value })
              }
            />
          </div>
        </div>
      ) : (
        <div>
          <label>Brackets</label>
          <p className="muted small">
            Each slab charges only the pay that falls inside it. They must start
            at 0 and join up without gaps; leave the last upper bound blank for
            the top slab.
          </p>
          {brackets.map((b, i) => (
            <div className="field-row" key={i}>
              <div className="field">
                <label>From</label>
                <input
                  value={b.lowerBound}
                  onChange={(e) => setBracket(i, 'lowerBound', e.target.value)}
                />
              </div>
              <div className="field">
                <label>To (blank = no limit)</label>
                <input
                  value={b.upperBound}
                  onChange={(e) => setBracket(i, 'upperBound', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Rate (%)</label>
                <input
                  value={b.rate}
                  onChange={(e) => setBracket(i, 'rate', e.target.value)}
                />
              </div>
            </div>
          ))}
          <div className="actions">
            <button
              className="btn small-btn"
              onClick={() =>
                setBrackets((bs) => [
                  ...bs,
                  {
                    lowerBound: bs[bs.length - 1]?.upperBound || '',
                    upperBound: '',
                    rate: '',
                  },
                ])
              }
            >
              Add bracket
            </button>
            {brackets.length > 1 && (
              <button
                className="btn small-btn"
                onClick={() => setBrackets((bs) => bs.slice(0, -1))}
              >
                Remove last
              </button>
            )}
          </div>
        </div>
      )}

      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create statutory rule
        </button>
      </div>
    </div>
  );
}
