import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  Appraisal,
  CalibrationView,
  CreateCycleInput,
  CycleType,
  Employee,
  Goal,
  GoalStatus,
  OutcomeType,
  RatingPoint,
  ReviewCycle,
  api,
} from '../api';

const OUTCOME_LABELS: Record<OutcomeType, string> = {
  none: 'No action',
  promotion: 'Promotion',
  increment: 'Increment',
  pip: 'Performance plan (PIP)',
};

// Performance management (T-3.2, FR-M6-01, 02, 05, 06). HR runs review cycles,
// calibrates the ratings, records outcomes (an increment applies a pay raise),
// and manages goals. Self and manager reviews are entered by employees and
// managers (mobile / self-service) and surface here on the calibration board.
export function Performance({ token }: { token: string }) {
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadCycles = useCallback(async () => {
    try {
      setCycles(await api.reviewCycles(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        setEmployees(await api.employees(token));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    })();
    void loadCycles();
  }, [token, loadCycles]);

  const selectedCycle = useMemo(
    () => cycles.find((c) => c.id === selectedCycleId) ?? null,
    [cycles, selectedCycleId],
  );

  const lifecycle = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await loadCycles();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}

      <div>
        <div className="section-head">
          <h2>Review cycles</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'New cycle'}
          </button>
        </div>
        <p className="muted small">
          A configurable appraisal window. Activate it to open an appraisal for
          every employee; move it to calibration to set final ratings and record
          outcomes; then close it. Select a cycle to calibrate.
        </p>

        <div className="stack">
          {showForm && (
            <NewCycleForm
              token={token}
              onError={setError}
              onCreated={() => {
                setShowForm(false);
                void loadCycles();
              }}
            />
          )}

          <div className="list">
            {cycles.map((c) => (
              <article
                className={`card row clickable ${c.id === selectedCycleId ? 'selected' : ''}`}
                key={c.id}
                onClick={() => setSelectedCycleId(c.id)}
              >
                <div className="grow">
                  <div className="row-title">
                    <span className={cyclePill(c.status)}>{c.status}</span>
                    <span className="notif-title">{c.name}</span>
                    <span className="tag">{c.cycleType}</span>
                    <span className="muted small">
                      {c.periodStart} to {c.periodEnd}
                    </span>
                    <span className="muted small">
                      {c.appraisals} appraisals
                    </span>
                  </div>
                </div>
                <div className="actions" onClick={(e) => e.stopPropagation()}>
                  {c.status === 'draft' && (
                    <button
                      className="btn primary"
                      onClick={() =>
                        void lifecycle(() => api.activateCycle(token, c.id))
                      }
                    >
                      Activate
                    </button>
                  )}
                  {c.status === 'active' && (
                    <button
                      className="btn primary"
                      onClick={() =>
                        void lifecycle(() =>
                          api.moveCycleToCalibration(token, c.id),
                        )
                      }
                    >
                      Start calibration
                    </button>
                  )}
                  {c.status === 'calibration' && (
                    <button
                      className="btn"
                      onClick={() =>
                        void lifecycle(() => api.closeCycle(token, c.id))
                      }
                    >
                      Close cycle
                    </button>
                  )}
                </div>
              </article>
            ))}
            {cycles.length === 0 && (
              <p className="muted">No review cycles yet.</p>
            )}
          </div>
        </div>
      </div>

      {selectedCycle && (
        <CalibrationBoard
          token={token}
          cycle={selectedCycle}
          onError={setError}
          onChanged={loadCycles}
        />
      )}

      <GoalsPanel token={token} employees={employees} onError={setError} />
    </div>
  );
}

function cyclePill(status: string): string {
  if (status === 'active' || status === 'closed') return 'pill status-approved';
  if (status === 'calibration') return 'pill status-pending';
  return 'pill retired';
}

function CalibrationBoard({
  token,
  cycle,
  onError,
  onChanged,
}: {
  token: string;
  cycle: ReviewCycle;
  onError: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [board, setBoard] = useState<CalibrationView | null>(null);
  const [rows, setRows] = useState<Appraisal[]>([]);

  const load = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([
        api.calibrationBoard(token, cycle.id),
        api.cycleAppraisals(token, cycle.id),
      ]);
      setBoard(b);
      setRows(a);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, cycle.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    onError('');
    try {
      await fn();
      await load();
      await onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  };

  if (!board) {
    return <div className="card muted">Loading calibration board...</div>;
  }

  const maxCount = Math.max(1, ...board.distribution.map((d) => d.count));

  return (
    <div>
      <h2>{cycle.name} · calibration</h2>
      <p className="muted small">
        The rating distribution (final rating, or the manager rating until a
        final one is set) so ratings can be normalized before the cycle closes.
      </p>

      <div className="stack">
        <div className="card">
          <div className="dist">
            {board.distribution.map((d) => (
              <div className="dist-row" key={d.value}>
                <span className="dist-label">
                  {d.value} · {d.label}
                </span>
                <div className="dist-track">
                  <div
                    className="dist-bar"
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="dist-count">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="list">
          {rows.map((a) => (
            <AppraisalRow
              key={a.id}
              appraisal={a}
              scale={board.scale}
              cycleStatus={cycle.status}
              token={token}
              onAct={act}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AppraisalRow({
  appraisal,
  scale,
  cycleStatus,
  token,
  onAct,
}: {
  appraisal: Appraisal;
  scale: RatingPoint[];
  cycleStatus: string;
  token: string;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [finalRating, setFinalRating] = useState(
    String(
      appraisal.finalRating ?? appraisal.managerRating ?? scale[0]?.value ?? 1,
    ),
  );

  const rating = (v: number | null) => (v == null ? '-' : String(v));

  return (
    <article className="card stack">
      <div className="row top">
        <div className="grow">
          <div className="row-title">
            <span className={pillFor(appraisal.status)}>
              {appraisal.status}
            </span>
            <span className="notif-title">{appraisal.employeeName}</span>
            <span className="muted small">{appraisal.employeeCode}</span>
          </div>
          <div className="muted small">
            self {rating(appraisal.selfRating)} · manager{' '}
            {rating(appraisal.managerRating)} · final{' '}
            <strong>{rating(appraisal.finalRating)}</strong>
          </div>
          {appraisal.managerComments && (
            <div className="muted small">
              manager: {appraisal.managerComments}
            </div>
          )}
        </div>
        {cycleStatus === 'calibration' && (
          <div className="actions">
            <select
              value={finalRating}
              onChange={(e) => setFinalRating(e.target.value)}
            >
              {scale.map((p) => (
                <option key={p.value} value={String(p.value)}>
                  {p.value} · {p.label}
                </option>
              ))}
            </select>
            <button
              className="btn primary"
              onClick={() =>
                void onAct(() =>
                  api.calibrateAppraisal(
                    token,
                    appraisal.id,
                    Number(finalRating),
                  ),
                )
              }
            >
              Set final
            </button>
          </div>
        )}
      </div>

      {appraisal.finalRating != null && (
        <OutcomeEditor appraisal={appraisal} token={token} onAct={onAct} />
      )}
    </article>
  );
}

function pillFor(status: string): string {
  if (status === 'calibrated' || status === 'closed')
    return 'pill status-approved';
  if (status === 'pending') return 'pill retired';
  return 'pill status-pending';
}

function OutcomeEditor({
  appraisal,
  token,
  onAct,
}: {
  appraisal: Appraisal;
  token: string;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const existing = appraisal.outcome;
  const [type, setType] = useState<OutcomeType>(
    existing?.outcomeType ?? 'none',
  );
  const [incrementAmount, setIncrementAmount] = useState(
    existing?.incrementAmount != null ? String(existing.incrementAmount) : '',
  );
  const [effectiveDate, setEffectiveDate] = useState(
    existing?.incrementEffectiveDate ?? '',
  );
  const [newJobTitle, setNewJobTitle] = useState(existing?.newJobTitle ?? '');
  const [developmentAreas, setDevelopmentAreas] = useState(
    existing?.developmentAreas ?? '',
  );

  const applied = existing?.compensationApplied ?? false;

  const save = () =>
    onAct(() =>
      api.setOutcome(token, appraisal.id, {
        outcomeType: type,
        incrementAmount: type === 'increment' ? Number(incrementAmount) : null,
        incrementEffectiveDate: type === 'increment' ? effectiveDate : null,
        newJobTitle: type === 'promotion' ? newJobTitle : null,
        developmentAreas: developmentAreas.trim() || null,
      }),
    );

  if (applied) {
    return (
      <div className="sub-card">
        <div className="row-title">
          <span className="pill status-approved">
            {OUTCOME_LABELS[existing!.outcomeType]}
          </span>
          <span className="muted small">
            applied {existing!.appliedAt?.replace('T', ' ')}
          </span>
        </div>
        {existing!.developmentAreas && (
          <div className="muted small">
            development: {existing!.developmentAreas}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sub-card stack">
      <div className="field-row">
        <div className="field">
          <label>Outcome</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OutcomeType)}
          >
            {(Object.keys(OUTCOME_LABELS) as OutcomeType[]).map((t) => (
              <option key={t} value={t}>
                {OUTCOME_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {type === 'increment' && (
          <>
            <div className="field">
              <label>Increment amount</label>
              <input
                value={incrementAmount}
                onChange={(e) => setIncrementAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Effective from</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </>
        )}
        {type === 'promotion' && (
          <div className="field grow">
            <label>New job title</label>
            <input
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="field-row">
        <div className="field grow">
          <label>Development areas (for L&amp;D)</label>
          <input
            value={developmentAreas}
            onChange={(e) => setDevelopmentAreas(e.target.value)}
          />
        </div>
        <div className="field align-end">
          <button className="btn" onClick={() => void save()}>
            Save outcome
          </button>
        </div>
        {existing && existing.outcomeType !== 'none' && (
          <div className="field align-end">
            <button
              className="btn primary"
              onClick={() =>
                void onAct(() => api.applyOutcome(token, appraisal.id))
              }
            >
              Apply to pay
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalsPanel({
  token,
  employees,
  onError,
}: {
  token: string;
  employees: Employee[];
  onError: (m: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!id) {
        setGoals([]);
        return;
      }
      try {
        setGoals(await api.employeeGoals(token, id));
      } catch (e) {
        onError(e instanceof ApiError ? e.message : String(e));
      }
    },
    [token, onError],
  );

  useEffect(() => {
    void load(employeeId);
  }, [employeeId, load]);

  const setProgress = async (goal: Goal, progress: number) => {
    onError('');
    try {
      await api.updateGoal(token, goal.id, { progress });
      await load(employeeId);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const setStatus = async (goal: Goal, status: GoalStatus) => {
    onError('');
    try {
      await api.updateGoal(token, goal.id, { status });
      await load(employeeId);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>Goals</h2>
        {employeeId && (
          <button
            className="btn primary small-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'New goal'}
          </button>
        )}
      </div>
      <div className="stack">
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} ({emp.employeeCode})
              </option>
            ))}
          </select>
        </div>

        {showForm && employeeId && (
          <NewGoalForm
            token={token}
            employeeId={employeeId}
            goals={goals}
            onError={onError}
            onCreated={() => {
              setShowForm(false);
              void load(employeeId);
            }}
          />
        )}

        <div className="list">
          {goals.map((g) => (
            <article className="card row top" key={g.id}>
              <div className="grow">
                <div className="row-title">
                  <span className={goalPill(g.status)}>{g.status}</span>
                  <span className="notif-title">{g.title}</span>
                  {g.weight != null && (
                    <span className="tag">weight {g.weight}</span>
                  )}
                  {g.parentTitle && (
                    <span className="muted small">under: {g.parentTitle}</span>
                  )}
                </div>
                <div className="progress-line">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={g.progress}
                    onChange={(e) =>
                      void setProgress(g, Number(e.target.value))
                    }
                  />
                  <span className="muted small">{g.progress}%</span>
                </div>
              </div>
              <div className="actions">
                {g.status !== 'cancelled' && g.status !== 'achieved' && (
                  <button
                    className="btn small-btn"
                    onClick={() => void setStatus(g, 'cancelled')}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </article>
          ))}
          {employeeId && goals.length === 0 && (
            <p className="muted">No goals for this employee.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function goalPill(status: string): string {
  if (status === 'achieved') return 'pill status-approved';
  if (status === 'missed' || status === 'cancelled') return 'pill retired';
  return 'pill status-pending';
}

function NewGoalForm({
  token,
  employeeId,
  goals,
  onCreated,
  onError,
}: {
  token: string;
  employeeId: string;
  goals: Goal[];
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    weight: '',
    parentGoalId: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) {
      onError('A goal needs a title.');
      return;
    }
    setBusy(true);
    try {
      await api.createGoal(token, {
        employeeId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        weight: form.weight.trim() ? Number(form.weight) : null,
        parentGoalId: form.parentGoalId || null,
      });
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
        <div className="field grow">
          <label>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Weight</label>
          <input
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Cascades from</label>
          <select
            value={form.parentGoalId}
            onChange={(e) => setForm({ ...form, parentGoalId: e.target.value })}
          >
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field grow">
          <label>Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="field align-end">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            Create goal
          </button>
        </div>
      </div>
    </div>
  );
}

function NewCycleForm({
  token,
  onCreated,
  onError,
}: {
  token: string;
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    cycleType: 'annual' as CycleType,
    periodStart: '',
    periodEnd: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.periodStart || !form.periodEnd) {
      onError('A name, start date, and end date are required.');
      return;
    }
    const body: CreateCycleInput = {
      name: form.name.trim(),
      cycleType: form.cycleType,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
    };
    setBusy(true);
    try {
      await api.createCycle(token, body);
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
        <div className="field grow">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Type</label>
          <select
            value={form.cycleType}
            onChange={(e) =>
              setForm({ ...form, cycleType: e.target.value as CycleType })
            }
          >
            <option value="annual">Annual</option>
            <option value="quarterly">Quarterly</option>
            <option value="probation">Probation</option>
          </select>
        </div>
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
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Create draft cycle
        </button>
      </div>
    </div>
  );
}
