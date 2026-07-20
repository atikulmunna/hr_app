import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  CreateExpenseCategoryBody,
  ExpenseCategory,
  ExpenseClaim,
  ExpenseSettlementMethod,
  LegalEntity,
  api,
} from '../api';

// Expense claims (T-2.6, FR-M8-01 to FR-M8-03). Employees build and submit
// claims from the mobile app; HR maintains the policy categories here and
// settles approved claims via payroll or direct disbursement.
export function Expenses({
  token,
  entities,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  onError: (message: string) => void;
}) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, cl] = await Promise.all([
        api.expenseCategories(token),
        api.expenseClaims(token),
      ]);
      setCategories(c);
      setClaims(cl);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const entityName = (id?: string | null) =>
    id ? (entities.find((e) => e.id === id)?.name ?? 'entity') : 'All entities';

  const toggleCategory = async (c: ExpenseCategory) => {
    setBusyId(c.id);
    try {
      await api.updateExpenseCategory(token, c.id, { active: !c.active });
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const settle = async (id: string, method: ExpenseSettlementMethod) => {
    setBusyId(id);
    try {
      await api.settleExpenseClaim(token, id, method);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="stack">
      <div>
        <div className="section-head">
          <h2>Expense categories</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'New category'}
          </button>
        </div>
        <p className="muted small">
          The spend policy. A category can set a per-line cap: a claim line over
          its cap is refused when the employee submits, so a claim never enters
          approval already breaching policy. Leave the cap blank for no limit.
        </p>

        {showForm && (
          <NewCategoryForm
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
          {categories.map((c) => (
            <article className="card row" key={c.id}>
              <div className="grow">
                <div className="row-title">
                  <span className={`pill ${c.active ? 'active' : 'retired'}`}>
                    {c.active ? 'active' : 'inactive'}
                  </span>
                  <span className="notif-title">{c.name}</span>
                  <span className="muted small">{c.code}</span>
                </div>
                <div className="muted small">
                  {entityName(c.legalEntityId)} ·{' '}
                  {c.limitAmount == null
                    ? 'no per-line cap'
                    : `cap ${c.limitAmount.toLocaleString()} per line`}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  disabled={busyId === c.id}
                  onClick={() => void toggleCategory(c)}
                >
                  {c.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </article>
          ))}
          {categories.length === 0 && (
            <p className="muted">No expense categories configured.</p>
          )}
        </div>
      </div>

      <div>
        <h2>Expense claims</h2>
        <p className="muted small">
          Claims employees submit from the app. Once a manager approves one, HR
          settles it: "via payroll" pays it on the employee's next run (as an
          off-cycle adjustment), "disbursement" records that it was paid out of
          band.
        </p>
        <div className="list">
          {claims.map((claim) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              token={token}
              busy={busyId === claim.id}
              onSettle={settle}
            />
          ))}
          {claims.length === 0 && <p className="muted">No expense claims.</p>}
        </div>
      </div>
    </div>
  );
}

const SETTLED_PILL: Record<string, string> = {
  settled: 'active',
  rejected: 'retired',
  cancelled: 'retired',
};

function ClaimCard({
  claim,
  token,
  busy,
  onSettle,
}: {
  claim: ExpenseClaim;
  token: string;
  busy: boolean;
  onSettle: (id: string, method: ExpenseSettlementMethod) => void;
}) {
  const money = (n: number) =>
    `${n.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${claim.currencyCode}`;

  const openReceipt = async (lineId: string) => {
    try {
      const blob = await api.expenseReceipt(token, claim.id, lineId);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      // A missing receipt is not worth interrupting the reviewer; the link
      // simply does nothing.
    }
  };

  return (
    <article className="card">
      <div className="row">
        <div className="grow">
          <div className="row-title">
            <span className={`pill ${SETTLED_PILL[claim.status] ?? ''}`}>
              {claim.status}
            </span>
            <span className="notif-title">{claim.title}</span>
            <span className="muted small">
              {claim.employeeName} ({claim.employeeCode})
            </span>
            <span className="tag">{money(claim.total)}</span>
          </div>
          {claim.settlementMethod && (
            <div className="muted small">
              settled via {claim.settlementMethod}
              {claim.settledAt
                ? ` on ${new Date(claim.settledAt).toLocaleDateString()}`
                : ''}
            </div>
          )}
        </div>
        {claim.status === 'approved' && (
          <div className="actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => onSettle(claim.id, 'payroll')}
            >
              Settle via payroll
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => onSettle(claim.id, 'disbursement')}
            >
              Disbursement
            </button>
          </div>
        )}
      </div>
      <div className="stack">
        {claim.lines.map((line) => (
          <div className="row-title" key={line.id}>
            <span className="muted small">{line.expenseDate}</span>
            <span className="tag">{line.categoryName}</span>
            <span>{line.description}</span>
            <span className="muted small">{money(line.amount)}</span>
            {line.hasReceipt && (
              <button
                className="btn small-btn"
                onClick={() => void openReceipt(line.id)}
              >
                receipt
              </button>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function NewCategoryForm({
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
    limitAmount: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      onError('Code and name are required.');
      return;
    }
    const body: CreateExpenseCategoryBody = {
      code: form.code.trim(),
      name: form.name.trim(),
      legalEntityId: form.legalEntityId || null,
      limitAmount: form.limitAmount.trim() ? Number(form.limitAmount) : null,
    };
    setBusy(true);
    try {
      await api.createExpenseCategory(token, body);
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
          <label>Per-line cap (blank = no limit)</label>
          <input
            value={form.limitAmount}
            onChange={(e) => setForm({ ...form, limitAmount: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Scope</label>
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
          Create category
        </button>
      </div>
    </div>
  );
}
