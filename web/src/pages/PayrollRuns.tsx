import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  CreatePayrollRunBody,
  LegalEntity,
  PayrollRun,
  PayrollRunDetail,
  api,
} from '../api';

// First and last day of the month N months back, as YYYY-MM-DD.
function monthRange(monthsAgo: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Payroll runs (T-2.2). A run values compensation as of its cut-off and
// snapshots what it paid, so it does not drift when salaries change later.
export function PayrollRuns({
  token,
  entities,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  onError: (message: string) => void;
}) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayrollRunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setRuns(await api.payrollRuns(token));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setBusy(true);
    try {
      setDetail(await api.payrollRun(token, id));
      setOpenId(id);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const recompute = async (id: string) => {
    setBusy(true);
    try {
      setDetail(await api.recomputePayrollRun(token, id));
      setOpenId(id);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.deletePayrollRun(token, id);
      setOpenId(null);
      setDetail(null);
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const entityName = (id: string) =>
    entities.find((e) => e.id === id)?.name ?? 'entity';

  return (
    <div>
      <div className="section-head">
        <h2>Payroll runs</h2>
        <button
          className="btn primary small-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'New run'}
        </button>
      </div>
      <p className="muted small">
        A run values pay as of its cut-off and records what it paid, so later
        salary changes do not alter it. Recompute to pull in corrections that
        arrived after the cut-off.
      </p>

      {showForm && (
        <NewRunForm
          token={token}
          entities={entities}
          onError={onError}
          onCreated={(created) => {
            setShowForm(false);
            setDetail(created);
            setOpenId(created.id);
            void load();
          }}
        />
      )}

      <div className="list">
        {runs.map((r) => (
          <article className="card" key={r.id}>
            <div className="row">
              <div className="grow">
                <div className="row-title">
                  <span className="tag">{r.currencyCode}</span>
                  <span className="notif-title">{entityName(r.legalEntityId)}</span>
                  <span className="muted small">
                    {r.periodStart} to {r.periodEnd}
                  </span>
                  {r.runType === 'off_cycle' && (
                    <span className="pill retired">off-cycle</span>
                  )}
                </div>
                <div className="muted small">
                  cut-off {r.cutoffDate} ·{' '}
                  {r.prorationBasis === 'working_days'
                    ? 'working days'
                    : 'calendar days'}
                </div>
              </div>
              <div className="actions">
                <button className="btn" disabled={busy} onClick={() => void open(r.id)}>
                  {openId === r.id ? 'Hide' : 'View'}
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void recompute(r.id)}
                >
                  Recompute
                </button>
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => void remove(r.id)}
                >
                  Delete
                </button>
              </div>
            </div>

            {openId === r.id && detail && <RunDetail detail={detail} />}
          </article>
        ))}
        {runs.length === 0 && <p className="muted">No payroll runs yet.</p>}
      </div>
    </div>
  );
}

function RunDetail({ detail }: { detail: PayrollRunDetail }) {
  const money = (v: number) =>
    `${v.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${detail.currencyCode}`;
  const unpaid = detail.employees.filter((e) => e.net === 0);

  return (
    <div className="stack">
      <div className="muted small case-meta">
        {detail.totals.employees} employees · gross {money(detail.totals.gross)} ·
        deductions {money(detail.totals.deductions)} · net{' '}
        {money(detail.totals.net)}
      </div>

      {unpaid.length > 0 && (
        <div className="banner">
          {unpaid.length} employee{unpaid.length > 1 ? 's' : ''} in this run have
          nothing to pay: no pay components are in force on {detail.cutoffDate}.
        </div>
      )}

      {detail.employees.map((e) => (
        <div className="card" key={e.employeeId}>
          <div className="row-title">
            <span className="notif-title">{e.name}</span>
            <span className="muted small">{e.employeeCode}</span>
            {e.prorationFactor < 1 && (
              <span className="pill retired">
                prorated {e.payableDays}/{e.periodDays} d
              </span>
            )}
          </div>
          <div className="muted small case-meta">
            gross {money(e.gross)} · deductions {money(e.deductions)} · net{' '}
            {money(e.net)}
          </div>
          {e.lines.map((l) => (
            <div className="line" key={l.code}>
              <span className="tag">{l.componentType}</span>
              <span className="grow">{l.name}</span>
              {l.prorationFactor < 1 && (
                <span className="muted small">
                  {money(l.baseAmount)} x {l.prorationFactor}
                </span>
              )}
              <span className="muted small">
                {l.componentType === 'deduction' ? '-' : ''}
                {money(l.amount)}
              </span>
            </div>
          ))}
          {e.lines.length === 0 && (
            <p className="muted small">No pay components in force.</p>
          )}
          {e.overtimeAmount > 0 && (
            <div className="line">
              <span className="tag">overtime</span>
              <span className="grow">Approved overtime</span>
              <span className="muted small">{e.overtimeHours} h</span>
              <span className="muted small">{money(e.overtimeAmount)}</span>
            </div>
          )}
          <div className="muted small">
            intake: present {e.presentDays} d · absent {e.absentDays} d · leave{' '}
            {e.leaveDays} d · worked {e.workedHours} h · approved overtime{' '}
            {e.overtimeHours} h
          </div>
        </div>
      ))}
    </div>
  );
}

function NewRunForm({
  token,
  entities,
  onCreated,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  onCreated: (run: PayrollRunDetail) => void;
  onError: (message: string) => void;
}) {
  const last = monthRange(1);
  const [form, setForm] = useState({
    legalEntityId: '',
    periodStart: last.start,
    periodEnd: last.end,
    cutoffDate: '',
    runType: 'monthly' as CreatePayrollRunBody['runType'],
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const legalEntityId = form.legalEntityId || entities[0]?.id;
    if (!legalEntityId) {
      onError('No legal entity available.');
      return;
    }
    setBusy(true);
    try {
      onCreated(
        await api.createPayrollRun(token, {
          legalEntityId,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          cutoffDate: form.cutoffDate || undefined,
          runType: form.runType,
        }),
      );
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
          <label>Legal entity</label>
          <select
            value={form.legalEntityId}
            onChange={(e) => setForm({ ...form, legalEntityId: e.target.value })}
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
          <label>Type</label>
          <select
            value={form.runType}
            onChange={(e) =>
              setForm({
                ...form,
                runType: e.target.value as CreatePayrollRunBody['runType'],
              })
            }
          >
            <option value="monthly">Monthly</option>
            <option value="off_cycle">Off-cycle</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Period start</label>
          <input
            type="date"
            value={form.periodStart}
            onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Period end</label>
          <input
            type="date"
            value={form.periodEnd}
            onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Data cut-off</label>
          <input
            type="date"
            value={form.cutoffDate}
            onChange={(e) => setForm({ ...form, cutoffDate: e.target.value })}
          />
        </div>
      </div>
      <p className="muted small">
        Pay is valued as of the cut-off. Leave it blank to use the period end.
      </p>
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void submit()}>
          Create and compute run
        </button>
      </div>
    </div>
  );
}
