import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  ChecklistKind,
  ChecklistSummary,
  ChecklistTemplateItem,
  ChecklistView,
  Employee,
  OrgNode,
  TaskView,
  TemplateItemInput,
  api,
} from '../api';

// Employee lifecycle (T-3.4b, FR-M1-06, FR-M1-10): the org chart derived from
// the reporting hierarchy, the caller's own lifecycle tasks, every open
// onboarding and offboarding checklist, and the templates they are opened from.
export function Lifecycle({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  // Completing a task changes checklist progress, so both panels reload.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}
      <MyTasksPanel
        token={token}
        onError={setError}
        version={version}
        onChange={bump}
      />
      <ChecklistsPanel
        token={token}
        onError={setError}
        version={version}
        onChange={bump}
      />
      <OrgChartPanel token={token} onError={setError} />
      <TemplatesPanel token={token} onError={setError} />
    </div>
  );
}

function fail(onError: (m: string) => void, e: unknown) {
  onError(e instanceof ApiError ? e.message : String(e));
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  manager: 'Manager',
  hr_admin: 'HR',
};

const KIND_LABELS: Record<ChecklistKind, string> = {
  onboarding: 'Onboarding',
  offboarding: 'Offboarding',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- My tasks: what the signed-in user owes, across every open checklist.

function MyTasksPanel({
  token,
  onError,
  version,
  onChange,
}: {
  token: string;
  onError: (m: string) => void;
  version: number;
  onChange: () => void;
}) {
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .myTasks(token)
      .then(setTasks)
      .catch((e) => fail(onError, e));
  }, [token, version, onError]);

  const complete = async (id: string) => {
    setBusy(id);
    try {
      await api.completeTask(token, id);
      onChange();
    } catch (e) {
      fail(onError, e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>My tasks</h2>
      </div>
      <div className="card">
        {tasks.length === 0 && (
          <p className="muted small">No lifecycle tasks are waiting for you.</p>
        )}
        {tasks.map((t) => (
          <div className="line" key={t.id}>
            <span className={`pill ${dueClass(t.dueOn)}`}>
              {dueLabel(t.dueOn)}
            </span>
            <span className="grow">
              {t.title}{' '}
              <span className="muted small">
                {KIND_LABELS[t.kind]} for {t.employeeName} as{' '}
                {ROLE_LABELS[t.assigneeRole] ?? t.assigneeRole}
              </span>
            </span>
            <button
              className="btn primary small-btn"
              disabled={busy === t.id}
              onClick={() => void complete(t.id)}
            >
              Done
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function dueLabel(dueOn: string | null): string {
  if (!dueOn) return 'No date';
  const diff = Math.round(
    (Date.parse(dueOn) - Date.parse(today())) / 86_400_000,
  );
  if (diff < 0) return `${-diff} d overdue`;
  if (diff === 0) return 'Due today';
  return `Due in ${diff} d`;
}

function dueClass(dueOn: string | null): string {
  if (!dueOn) return 'day-scheduled';
  const diff = Date.parse(dueOn) - Date.parse(today());
  if (diff < 0) return 'day-absent';
  if (diff === 0) return 'day-late';
  return 'day-scheduled';
}

// --- Checklists: every open one with progress, expandable to its items, plus a
// form to open one by hand.

function ChecklistsPanel({
  token,
  onError,
  version,
  onChange,
}: {
  token: string;
  onError: (m: string) => void;
  version: number;
  onChange: () => void;
}) {
  const [status, setStatus] = useState<'open' | 'complete'>('open');
  const [lists, setLists] = useState<ChecklistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChecklistView | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLists(await api.checklists(token, status));
    } catch (e) {
      fail(onError, e);
    }
  }, [token, status, onError]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api
      .checklist(token, selectedId)
      .then(setDetail)
      .catch((e) => fail(onError, e));
  }, [token, selectedId, version, onError]);

  const complete = async (itemId: string) => {
    setBusy(itemId);
    try {
      const view = await api.completeTask(token, itemId);
      setDetail(view);
      onChange();
    } catch (e) {
      fail(onError, e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>Checklists</h2>
        <div className="head-actions">
          <div className="filters">
            {(['open', 'complete'] as const).map((s) => (
              <button
                key={s}
                className={`tab ${status === s ? 'active' : ''}`}
                onClick={() => {
                  setStatus(s);
                  setSelectedId(null);
                }}
              >
                {s === 'open' ? 'Open' : 'Complete'}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setShowOpen((v) => !v)}>
            {showOpen ? 'Cancel' : 'Open a checklist'}
          </button>
        </div>
      </div>

      <div className="stack">
        {showOpen && (
          <OpenChecklistForm
            token={token}
            onError={onError}
            onOpened={(view) => {
              setShowOpen(false);
              setStatus('open');
              setSelectedId(view.id);
              onChange();
            }}
          />
        )}

        {lists.length === 0 && (
          <p className="muted small">
            {status === 'open'
              ? 'No onboarding or offboarding is in progress.'
              : 'No completed checklists yet.'}
          </p>
        )}

        {lists.length > 0 && (
          <div className="split">
            <div className="master">
              <div className="list">
                {lists.map((c) => (
                  <button
                    key={c.id}
                    className={`card employee-row ${selectedId === c.id ? 'active' : ''}`}
                    onClick={() =>
                      setSelectedId(selectedId === c.id ? null : c.id)
                    }
                  >
                    <div className="row-title">
                      <span className="tag">{KIND_LABELS[c.kind]}</span>
                      {c.overdue > 0 && (
                        <span className="pill day-absent">
                          {c.overdue} overdue
                        </span>
                      )}
                    </div>
                    <div>{c.employeeName}</div>
                    <div className="muted small">
                      {c.employeeCode} · from {c.anchorDate}
                    </div>
                    <Progress done={c.done} total={c.total} />
                  </button>
                ))}
              </div>
            </div>

            {detail && (
              <article className="card detail-panel stack">
                <div className="section-head">
                  <h3>
                    {KIND_LABELS[detail.kind]}: {detail.employeeName}
                  </h3>
                  <span className="muted small">
                    {detail.done}/{detail.total} done
                    {detail.completedAt
                      ? `, completed ${new Date(detail.completedAt).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
                {detail.items.map((i) => (
                  <div className="line" key={i.id}>
                    <span
                      className={`pill ${
                        i.status === 'done'
                          ? 'status-approved'
                          : dueClass(i.dueOn)
                      }`}
                    >
                      {i.status === 'done' ? 'Done' : dueLabel(i.dueOn)}
                    </span>
                    <span className="grow">
                      {i.title}{' '}
                      <span className="muted small">
                        {ROLE_LABELS[i.assigneeRole] ?? i.assigneeRole}
                        {i.dueOn ? ` · due ${i.dueOn}` : ''}
                        {i.note ? ` · ${i.note}` : ''}
                      </span>
                    </span>
                    {i.status === 'pending' && detail.status === 'open' && (
                      <button
                        className="btn small-btn"
                        disabled={busy === i.id}
                        onClick={() => void complete(i.id)}
                      >
                        Mark done
                      </button>
                    )}
                  </div>
                ))}
              </article>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="dist-row progress">
      <span className="dist-label">
        {done}/{total} tasks
      </span>
      <div className="dist-track">
        <div className="dist-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="dist-count small">{pct}%</span>
    </div>
  );
}

function OpenChecklistForm({
  token,
  onError,
  onOpened,
}: {
  token: string;
  onError: (m: string) => void;
  onOpened: (view: ChecklistView) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<ChecklistKind>('onboarding');
  const [anchorDate, setAnchorDate] = useState(today());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .employees(token)
      .then((list) => setEmployees(list.filter((e) => !e.erasedAt)))
      .catch((e) => fail(onError, e));
  }, [token, onError]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!employeeId) return;
    setSaving(true);
    try {
      onOpened(
        await api.openChecklist(token, { employeeId, kind, anchorDate }),
      );
    } catch (e) {
      fail(onError, e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form sub-card" onSubmit={(e) => void submit(e)}>
      <div className="field-row">
        <label className="field">
          Employee
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
          >
            <option value="">Choose...</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employeeCode} {e.firstName} {e.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ChecklistKind)}
          >
            <option value="onboarding">Onboarding</option>
            <option value="offboarding">Offboarding</option>
          </select>
        </label>
        <label className="field">
          Anchor date
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            required
          />
        </label>
      </div>
      <p className="muted small">
        Task due dates count from the anchor date: the hire date for onboarding,
        the leaving date for offboarding.
      </p>
      <div className="actions">
        <button
          className="btn primary"
          type="submit"
          disabled={saving || !employeeId}
        >
          Open
        </button>
      </div>
    </form>
  );
}

// --- Org chart: the reporting hierarchy as a collapsible tree.

function OrgChartPanel({
  token,
  onError,
}: {
  token: string;
  onError: (m: string) => void;
}) {
  const [roots, setRoots] = useState<OrgNode[]>([]);
  const [headcount, setHeadcount] = useState(0);

  useEffect(() => {
    api
      .orgChart(token)
      .then((c) => {
        setRoots(c.roots);
        setHeadcount(c.headcount);
      })
      .catch((e) => fail(onError, e));
  }, [token, onError]);

  return (
    <div>
      <div className="section-head">
        <h2>Org chart</h2>
        <span className="muted small">{headcount} active</span>
      </div>
      <div className="card">
        {roots.length === 0 && (
          <p className="muted small">No active employees.</p>
        )}
        <ul className="org-tree">
          {roots.map((n) => (
            <OrgBranch key={n.id} node={n} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function OrgBranch({ node }: { node: OrgNode }) {
  const [open, setOpen] = useState(true);
  const hasReports = node.reports.length > 0;
  return (
    <li>
      <div className="org-node">
        <button
          className="org-toggle"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasReports}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasReports ? (open ? '-' : '+') : '·'}
        </button>
        <span className="grow">
          <strong>{node.name}</strong>{' '}
          <span className="muted small">
            {node.jobTitle ?? node.employeeCode}
            {node.departmentName ? ` · ${node.departmentName}` : ''}
            {` · ${node.legalEntityName}`}
          </span>
        </span>
        {hasReports && (
          <span className="muted small">
            {node.reports.length} direct · {node.span} total
          </span>
        )}
      </div>
      {open && hasReports && (
        <ul className="org-tree">
          {node.reports.map((r) => (
            <OrgBranch key={r.id} node={r} />
          ))}
        </ul>
      )}
    </li>
  );
}

// --- Templates: the ordered tasks each kind opens with.

function TemplatesPanel({
  token,
  onError,
}: {
  token: string;
  onError: (m: string) => void;
}) {
  const [kind, setKind] = useState<ChecklistKind>('onboarding');
  const [templates, setTemplates] = useState<Record<
    ChecklistKind,
    ChecklistTemplateItem[]
  > | null>(null);
  const [draft, setDraft] = useState<TemplateItemInput[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .checklistTemplates(token)
      .then(setTemplates)
      .catch((e) => fail(onError, e));
  }, [token, onError]);

  const items = templates?.[kind] ?? [];

  const startEdit = () =>
    setDraft(
      items.map((i) => ({
        title: i.title,
        assigneeRole: i.assigneeRole,
        dueOffsetDays: i.dueOffsetDays,
      })),
    );

  const update = (index: number, patch: Partial<TemplateItemInput>) =>
    setDraft(
      (d) => d && d.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const remove = (index: number) =>
    setDraft((d) => d && d.filter((_, i) => i !== index));

  const move = (index: number, delta: number) =>
    setDraft((d) => {
      if (!d) return d;
      const target = index + delta;
      if (target < 0 || target >= d.length) return d;
      const next = [...d];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.replaceChecklistTemplate(token, kind, draft);
      setTemplates((t) => (t ? { ...t, [kind]: saved } : t));
      setDraft(null);
    } catch (e) {
      fail(onError, e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>Checklist templates</h2>
        <div className="head-actions">
          <div className="filters">
            {(['onboarding', 'offboarding'] as const).map((k) => (
              <button
                key={k}
                className={`tab ${kind === k ? 'active' : ''}`}
                onClick={() => {
                  setKind(k);
                  setDraft(null);
                }}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          {draft ? (
            <>
              <button
                className="btn"
                onClick={() => setDraft(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => void save()}
                disabled={saving || draft.length === 0}
              >
                Save
              </button>
            </>
          ) : (
            <button className="btn" onClick={startEdit} disabled={!templates}>
              Edit
            </button>
          )}
        </div>
      </div>
      <p className="muted small">
        A new checklist copies these tasks; editing the template does not change
        checklists already in progress. Offsets are days from the anchor date,
        negative for before it.
      </p>

      <div className="card">
        {!draft &&
          items.map((i) => (
            <div className="line" key={i.id}>
              <span className="tag">
                {ROLE_LABELS[i.assigneeRole] ?? i.assigneeRole}
              </span>
              <span className="grow">{i.title}</span>
              <span className="muted small">
                {i.dueOffsetDays === 0
                  ? 'on the day'
                  : i.dueOffsetDays > 0
                    ? `+${i.dueOffsetDays} d`
                    : `${i.dueOffsetDays} d`}
              </span>
            </div>
          ))}

        {draft && (
          <div className="stack">
            {draft.map((row, index) => (
              <div className="field-row template-row" key={index}>
                <label className="field grow">
                  Task
                  <input
                    value={row.title}
                    onChange={(e) => update(index, { title: e.target.value })}
                  />
                </label>
                <label className="field">
                  Owner
                  <select
                    value={row.assigneeRole}
                    onChange={(e) =>
                      update(index, { assigneeRole: e.target.value })
                    }
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Offset (days)
                  <input
                    type="number"
                    value={row.dueOffsetDays}
                    onChange={(e) =>
                      update(index, {
                        dueOffsetDays: Number.parseInt(
                          e.target.value || '0',
                          10,
                        ),
                      })
                    }
                  />
                </label>
                <div className="actions">
                  <button
                    className="btn small-btn"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    Up
                  </button>
                  <button
                    className="btn small-btn"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.length - 1}
                  >
                    Down
                  </button>
                  <button
                    className="btn danger small-btn"
                    onClick={() => remove(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="actions">
              <button
                className="btn"
                onClick={() =>
                  setDraft((d) => [
                    ...(d ?? []),
                    { title: '', assigneeRole: 'hr_admin', dueOffsetDays: 0 },
                  ])
                }
              >
                Add task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
