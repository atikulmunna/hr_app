import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Certification,
  Employee,
  ProficiencyLevel,
  RoleSkill,
  Skill,
  SkillMatrix,
  api,
} from '../api';
import { errorMessage } from '../lib/errors';

// Learning and development (T-3.3, FR-M7-03, FR-M7-04). HR maintains a skill
// catalog, sets the proficiency each role requires, records employee
// proficiencies (the matrix), and tracks certifications whose expiry raises an
// in-app reminder for HR and the employee.
export function Learning({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}
      <SkillMatrixPanel token={token} onError={setError} />
      <CertificationsPanel token={token} onError={setError} />
    </div>
  );
}

function fail(onError: (m: string) => void, e: unknown) {
  onError(errorMessage(e));
}

function SkillMatrixPanel({
  token,
  onError,
}: {
  token: string;
  onError: (m: string) => void;
}) {
  const [levels, setLevels] = useState<ProficiencyLevel[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [role, setRole] = useState('');
  const [matrix, setMatrix] = useState<SkillMatrix | null>(null);
  const [roleSkills, setRoleSkills] = useState<RoleSkill[]>([]);
  const [showSkillForm, setShowSkillForm] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const [lv, rs, sk] = await Promise.all([
        api.proficiencyLevels(token),
        api.learningRoles(token),
        api.skills(token),
      ]);
      setLevels(lv);
      setRoles(rs);
      setSkills(sk);
    } catch (e) {
      fail(onError, e);
    }
  }, [token, onError]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadRole = useCallback(
    async (r: string) => {
      if (!r) {
        setMatrix(null);
        setRoleSkills([]);
        return;
      }
      try {
        const [mx, rsk] = await Promise.all([
          api.skillMatrix(token, r),
          api.roleSkills(token, r),
        ]);
        setMatrix(mx);
        setRoleSkills(rsk);
      } catch (e) {
        fail(onError, e);
      }
    },
    [token, onError],
  );

  useEffect(() => {
    void loadRole(role);
  }, [role, loadRole]);

  const levelLabel = useMemo(() => {
    const map = new Map(levels.map((l) => [l.value, l.label]));
    return (v: number) => map.get(v) ?? String(v);
  }, [levels]);

  const refresh = () => void loadRole(role);

  return (
    <div>
      <div className="section-head">
        <h2>Skill matrix</h2>
        <button
          className="btn primary small-btn"
          onClick={() => setShowSkillForm((v) => !v)}
        >
          {showSkillForm ? 'Cancel' : 'New skill'}
        </button>
      </div>
      <p className="muted small">
        Track the competencies each role needs and the level each person holds.
        A cell below the role requirement is a gap. Select a role to see its
        matrix.
      </p>

      <div className="stack">
        {showSkillForm && (
          <NewSkillForm
            token={token}
            onError={onError}
            onCreated={() => {
              setShowSkillForm(false);
              void loadCatalog();
            }}
          />
        )}

        <div className="field" style={{ maxWidth: 320 }}>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Select role</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {role && matrix && (
          <>
            <RequirementsEditor
              token={token}
              role={role}
              skills={skills}
              levels={levels}
              roleSkills={roleSkills}
              onError={onError}
              onChanged={refresh}
            />
            <MatrixTable matrix={matrix} levelLabel={levelLabel} />
            {matrix.rows.length > 0 && (
              <ProficiencyEditor
                token={token}
                matrix={matrix}
                skills={skills}
                levels={levels}
                onError={onError}
                onChanged={refresh}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MatrixTable({
  matrix,
  levelLabel,
}: {
  matrix: SkillMatrix;
  levelLabel: (v: number) => string;
}) {
  if (matrix.columns.length === 0) {
    return (
      <p className="muted small">
        No skills defined for this role yet. Add a requirement below.
      </p>
    );
  }
  if (matrix.rows.length === 0) {
    return <p className="muted small">No active employees hold this role.</p>;
  }
  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th className="rowhead">Employee</th>
            {matrix.columns.map((c) => (
              <th key={c.skillId}>
                {c.name}
                {c.requiredLevel != null && (
                  <div className="req">req {c.requiredLevel}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.employeeId}>
              <td className="rowhead">
                {r.employeeName}
                <div className="muted small">{r.employeeCode}</div>
              </td>
              {r.cells.map((cell) => (
                <td key={cell.skillId} className={cellClass(cell)}>
                  {cell.level == null ? (
                    <span className="cell-empty">-</span>
                  ) : (
                    <span title={levelLabel(cell.level)}>{cell.level}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellClass(cell: {
  level: number | null;
  meetsRequirement: boolean;
}): string {
  if (cell.level == null) return '';
  return cell.meetsRequirement ? 'cell-met' : 'cell-gap';
}

function RequirementsEditor({
  token,
  role,
  skills,
  levels,
  roleSkills,
  onError,
  onChanged,
}: {
  token: string;
  role: string;
  skills: Skill[];
  levels: ProficiencyLevel[];
  roleSkills: RoleSkill[];
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [skillId, setSkillId] = useState('');
  const [level, setLevel] = useState(String(levels[2]?.value ?? 3));

  const act = async (fn: () => Promise<unknown>) => {
    onError('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      fail(onError, e);
    }
  };

  return (
    <div className="sub-card stack">
      <h3>Required skills for {role}</h3>
      <div className="list">
        {roleSkills.map((rs) => (
          <div className="row-title" key={rs.id}>
            <span className="tag">{rs.skillName}</span>
            <span className="muted small">level {rs.requiredLevel}</span>
            <button
              className="btn small-btn"
              onClick={() => void act(() => api.removeRoleSkill(token, rs.id))}
            >
              Remove
            </button>
          </div>
        ))}
        {roleSkills.length === 0 && (
          <p className="muted small">No requirements set for this role.</p>
        )}
      </div>
      <div className="field-row">
        <div className="field grow">
          <label>Add required skill</label>
          <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
            <option value="">Select skill</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Required level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {levels.map((l) => (
              <option key={l.value} value={String(l.value)}>
                {l.value} · {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field align-end">
          <button
            className="btn primary"
            disabled={!skillId}
            onClick={() =>
              void act(async () => {
                await api.setRoleSkill(token, {
                  role,
                  skillId,
                  requiredLevel: Number(level),
                });
                setSkillId('');
              })
            }
          >
            Set requirement
          </button>
        </div>
      </div>
    </div>
  );
}

function ProficiencyEditor({
  token,
  matrix,
  skills,
  levels,
  onError,
  onChanged,
}: {
  token: string;
  matrix: SkillMatrix;
  skills: Skill[];
  levels: ProficiencyLevel[];
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [level, setLevel] = useState(String(levels[2]?.value ?? 3));

  const submit = async () => {
    if (!employeeId || !skillId) {
      onError('Pick an employee and a skill.');
      return;
    }
    onError('');
    try {
      await api.setEmployeeSkill(token, {
        employeeId,
        skillId,
        level: Number(level),
      });
      setSkillId('');
      onChanged();
    } catch (e) {
      fail(onError, e);
    }
  };

  return (
    <div className="sub-card stack">
      <h3>Record a proficiency</h3>
      <div className="field-row">
        <div className="field grow">
          <label>Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Select employee</option>
            {matrix.rows.map((r) => (
              <option key={r.employeeId} value={r.employeeId}>
                {r.employeeName} ({r.employeeCode})
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>Skill</label>
          <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
            <option value="">Select skill</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {levels.map((l) => (
              <option key={l.value} value={String(l.value)}>
                {l.value} · {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field align-end">
          <button className="btn primary" onClick={() => void submit()}>
            Save level
          </button>
        </div>
      </div>
    </div>
  );
}

function NewSkillForm({
  token,
  onCreated,
  onError,
}: {
  token: string;
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: '', category: '', description: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      onError('A skill needs a name.');
      return;
    }
    setBusy(true);
    try {
      await api.createSkill(token, {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      fail(onError, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field grow">
          <label>Skill name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Category</label>
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </div>
        <div className="field grow">
          <label>Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Add skill
        </button>
      </div>
    </div>
  );
}

function CertificationsPanel({
  token,
  onError,
}: {
  token: string;
  onError: (m: string) => void;
}) {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, emps] = await Promise.all([
        api.certifications(token),
        api.employees(token),
      ]);
      setCerts(list);
      setEmployees(emps);
    } catch (e) {
      fail(onError, e);
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    onError('');
    try {
      await api.removeCertification(token, id);
      await load();
    } catch (e) {
      fail(onError, e);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h2>Certifications</h2>
        <button
          className="btn primary small-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'New certification'}
        </button>
      </div>
      <p className="muted small">
        Track credentials and their expiry. A certification within 30 days of
        expiry (or already expired) raises a one-time reminder for HR and the
        employee in their inbox.
      </p>

      <div className="stack">
        {showForm && (
          <NewCertificationForm
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
          {certs.map((c) => (
            <article className="card row top" key={c.id}>
              <div className="grow">
                <div className="row-title">
                  <span className={certPill(c.status)}>{certLabel(c)}</span>
                  <span className="notif-title">{c.name}</span>
                  <span className="muted small">
                    {c.employeeName} ({c.employeeCode})
                  </span>
                  {c.issuer && <span className="tag">{c.issuer}</span>}
                </div>
                <div className="muted small">
                  {c.expiresOn ? `expires ${c.expiresOn}` : 'no expiry'}
                  {c.issuedOn ? ` · issued ${c.issuedOn}` : ''}
                  {c.credentialId ? ` · ${c.credentialId}` : ''}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn small-btn"
                  onClick={() => void remove(c.id)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
          {certs.length === 0 && (
            <p className="muted">No certifications recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function certPill(status: string): string {
  if (status === 'valid') return 'pill status-approved';
  if (status === 'expiring') return 'pill status-pending';
  return 'pill status-rejected';
}

function certLabel(c: Certification): string {
  if (c.status === 'valid') return 'valid';
  if (c.status === 'expired') return 'expired';
  return c.daysToExpiry != null ? `expires in ${c.daysToExpiry}d` : 'expiring';
}

function NewCertificationForm({
  token,
  employees,
  onCreated,
  onError,
}: {
  token: string;
  employees: Employee[];
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    issuer: '',
    credentialId: '',
    issuedOn: '',
    expiresOn: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.employeeId || !form.name.trim()) {
      onError('An employee and a certification name are required.');
      return;
    }
    setBusy(true);
    try {
      await api.createCertification(token, {
        employeeId: form.employeeId,
        name: form.name.trim(),
        issuer: form.issuer.trim() || undefined,
        credentialId: form.credentialId.trim() || undefined,
        issuedOn: form.issuedOn || null,
        expiresOn: form.expiresOn || null,
      });
      onCreated();
    } catch (e) {
      fail(onError, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field grow">
          <label>Employee</label>
          <select
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} ({emp.employeeCode})
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>Certification</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Issuer</label>
          <input
            value={form.issuer}
            onChange={(e) => setForm({ ...form, issuer: e.target.value })}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Credential ID</label>
          <input
            value={form.credentialId}
            onChange={(e) => setForm({ ...form, credentialId: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Issued on</label>
          <input
            type="date"
            value={form.issuedOn}
            onChange={(e) => setForm({ ...form, issuedOn: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Expires on</label>
          <input
            type="date"
            value={form.expiresOn}
            onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          />
        </div>
        <div className="field align-end">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            Add certification
          </button>
        </div>
      </div>
    </div>
  );
}
