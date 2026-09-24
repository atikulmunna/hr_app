import { useCallback, useEffect, useState } from 'react';
import { CreateAdjustmentBody, Employee, PayrollAdjustment, api } from '../api';
import { errorMessage } from '../lib/errors';

// Off-cycle payroll adjustments (T-2.5, FR-M4-11). A locked period cannot be
// rewritten, so a correction is a signed adjustment settled into a later run.
export function PayrollAdjustments({
  token,
  onError,
}: {
  token: string;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<PayrollAdjustment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([
        api.payrollAdjustments(token),
        api.employees(token),
      ]);
      setRows(a);
      setEmployees(e);
    } catch (e) {
      onError(errorMessage(e));
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await api.cancelPayrollAdjustment(token, id);
      await load();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const money = (a: PayrollAdjustment) =>
    `${a.amount < 0 ? '-' : '+'}${Math.abs(a.amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
    })} ${a.currencyCode}`;

  return (
    <div>
      <div className="section-head">
        <h2>Off-cycle adjustments</h2>
        <button
          className="btn primary small-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'New adjustment'}
        </button>
      </div>
      <p className="muted small">
        A locked payroll period is never rewritten. A correction, such as a mark
        rejected after lock, is a signed adjustment (negative claws back) that
        needs approval and then settles into the next run for that entity.
      </p>

      {showForm && (
        <NewAdjustmentForm
          token={token}
          employees={employees}
          onError={onError}
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      <div className="list">
        {rows.map((a) => (
          <article className="card row" key={a.id}>
            <div className="grow">
              <div className="row-title">
                <span
                  className={`pill ${
                    a.status === 'settled'
                      ? 'active'
                      : a.status === 'rejected' || a.status === 'cancelled'
                        ? 'retired'
                        : ''
                  }`}
                >
                  {a.status}
                </span>
                <span className="notif-title">{a.employeeName}</span>
                <span className="muted small">{a.employeeCode}</span>
                <span className={a.amount < 0 ? 'tag' : 'tag'}>{money(a)}</span>
              </div>
              <div className="muted small">{a.reason}</div>
            </div>
            {a.status !== 'settled' && a.status !== 'cancelled' && (
              <div className="actions">
                <button
                  className="btn"
                  disabled={busyId === a.id}
                  onClick={() => void cancel(a.id)}
                >
                  Cancel
                </button>
              </div>
            )}
          </article>
        ))}
        {rows.length === 0 && <p className="muted">No adjustments.</p>}
      </div>
    </div>
  );
}

function NewAdjustmentForm({
  token,
  employees,
  onCreated,
  onError,
}: {
  token: string;
  employees: Employee[];
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({ employeeId: '', amount: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amount = Number(form.amount);
    if (!form.employeeId || !form.reason.trim()) {
      onError('Employee and reason are required.');
      return;
    }
    if (!form.amount.trim() || Number.isNaN(amount) || amount === 0) {
      onError('Enter a non-zero amount; negative claws back.');
      return;
    }
    const body: CreateAdjustmentBody = {
      employeeId: form.employeeId,
      amount,
      reason: form.reason.trim(),
    };
    setBusy(true);
    try {
      await api.createPayrollAdjustment(token, body);
      onCreated();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field">
          <label>Employee</label>
          <select
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">Select an employee</option>
            {employees
              .filter((e) => !e.erasedAt)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeCode})
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label>Amount (negative to claw back)</label>
          <input
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Reason</label>
        <input
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </div>
      <p className="muted small">
        The amount is in the employee's entity currency. It needs approval
        before it settles into a run.
      </p>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Raise adjustment
        </button>
      </div>
    </div>
  );
}
