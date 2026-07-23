import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  Application,
  ApplicationSource,
  CreateRequisitionInput,
  Department,
  Employee,
  LegalEntity,
  Offer,
  PipelineStage,
  Recommendation,
  Requisition,
  api,
} from '../api';

const SOURCES: { value: ApplicationSource; label: string }[] = [
  { value: 'referral', label: 'Referral' },
  { value: 'job_board', label: 'Job board' },
  { value: 'agency', label: 'Agency' },
  { value: 'campus', label: 'Campus' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
];

const RECOMMENDATIONS: { value: Recommendation; label: string }[] = [
  { value: 'strong_yes', label: 'Strong yes' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'strong_no', label: 'Strong no' },
];

// Recruitment / ATS (T-3.1, FR-M5-01 to FR-M5-07). A requisition is drafted and
// sent for COO approval (decided in Approvals); once approved it accepts
// candidates who move through the pipeline, are interviewed with per-reviewer
// scorecards, and receive an offer that is e-signed and converted to an employee.
export function Recruitment({ token }: { token: string }) {
  const [reqs, setReqs] = useState<Requisition[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReqForm, setShowReqForm] = useState(false);

  const loadReqs = useCallback(async () => {
    try {
      setReqs(await api.requisitions(token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const [st, ent, dep, emp] = await Promise.all([
          api.recruitmentStages(token),
          api.entities(token),
          api.departments(token),
          api.employees(token),
        ]);
        setStages(st);
        setEntities(ent);
        setDepartments(dep);
        setEmployees(emp);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    })();
    void loadReqs();
  }, [token, loadReqs]);

  const loadApps = useCallback(
    async (requisitionId: string) => {
      try {
        setApps(await api.applications(token, requisitionId));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    },
    [token],
  );

  const selectReq = (id: string) => {
    setSelectedReqId(id);
    setSelectedAppId(null);
    setApps([]);
    void loadApps(id);
  };

  const selectedReq = useMemo(
    () => reqs.find((r) => r.id === selectedReqId) ?? null,
    [reqs, selectedReqId],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await loadReqs();
      if (selectedReqId) {
        await loadApps(selectedReqId);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}

      <div>
        <div className="section-head">
          <h2>Requisitions</h2>
          <button
            className="btn primary small-btn"
            onClick={() => setShowReqForm((v) => !v)}
          >
            {showReqForm ? 'Cancel' : 'New requisition'}
          </button>
        </div>
        <p className="muted small">
          A headcount request. Draft it, then submit it for the COO to approve in
          the Approvals tab. Once approved it accepts candidates through the
          pipeline. Select one to see its applications.
        </p>

        <div className="stack">
        {showReqForm && (
          <NewRequisitionForm
            token={token}
            entities={entities}
            departments={departments}
            onError={setError}
            onCreated={() => {
              setShowReqForm(false);
              void loadReqs();
            }}
          />
        )}

        <div className="list">
          {reqs.map((r) => (
            <article
              className={`card row top clickable ${r.id === selectedReqId ? 'selected' : ''}`}
              key={r.id}
              onClick={() => selectReq(r.id)}
            >
              <div className="grow">
                <div className="row-title">
                  <span className={pillClass(r.status)}>{r.status}</span>
                  <span className="notif-title">{r.title}</span>
                  <span className="muted small">{r.legalEntityName}</span>
                  {r.departmentName && (
                    <span className="tag">{r.departmentName}</span>
                  )}
                </div>
                <div className="muted small">
                  {r.headcount} opening{r.headcount === 1 ? '' : 's'} ·{' '}
                  {r.employmentType} · {r.openApplications} in pipeline ·{' '}
                  {r.hires} hired
                </div>
              </div>
              <div className="actions" onClick={(e) => e.stopPropagation()}>
                {r.status === 'draft' && (
                  <button
                    className="btn primary"
                    onClick={() => void run(() => api.submitRequisition(token, r.id))}
                  >
                    Submit for approval
                  </button>
                )}
                {(r.status === 'approved' || r.status === 'pending') && (
                  <button
                    className="btn"
                    onClick={() => void run(() => api.closeRequisition(token, r.id))}
                  >
                    Close
                  </button>
                )}
              </div>
            </article>
          ))}
          {reqs.length === 0 && <p className="muted">No requisitions yet.</p>}
        </div>
        </div>
      </div>

      {selectedReq && (
        <RequisitionPipeline
          token={token}
          requisition={selectedReq}
          stages={stages}
          employees={employees}
          apps={apps}
          selectedAppId={selectedAppId}
          onSelectApp={setSelectedAppId}
          onError={setError}
          onChanged={() => void run(async () => undefined)}
        />
      )}
    </div>
  );
}

function pillClass(status: string): string {
  const green = ['approved', 'filled', 'hired', 'signed', 'active'];
  const amber = ['pending', 'sent'];
  const grey = ['draft', 'closed', 'withdrawn'];
  if (green.includes(status)) return 'pill status-approved';
  if (amber.includes(status)) return 'pill status-pending';
  if (grey.includes(status)) return 'pill retired';
  return 'pill status-rejected';
}

function RequisitionPipeline({
  token,
  requisition,
  stages,
  employees,
  apps,
  selectedAppId,
  onSelectApp,
  onError,
  onChanged,
}: {
  token: string;
  requisition: Requisition;
  stages: PipelineStage[];
  employees: Employee[];
  apps: Application[];
  selectedAppId: string | null;
  onSelectApp: (id: string | null) => void;
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const canAdd = requisition.status === 'approved';

  return (
    <div>
      <div className="section-head">
        <h2>{requisition.title} · pipeline</h2>
        {canAdd && (
          <button
            className="btn primary small-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'Add candidate'}
          </button>
        )}
      </div>
      {!canAdd && (
        <p className="muted small">
          This requisition is {requisition.status}. Candidates can be added once
          it is approved.
        </p>
      )}

      <div className="stack">
      {showForm && canAdd && (
        <NewCandidateForm
          token={token}
          requisitionId={requisition.id}
          employees={employees}
          onError={onError}
          onCreated={() => {
            setShowForm(false);
            onChanged();
          }}
        />
      )}

      <div className="list">
        {apps.map((a) => (
          <div key={a.id}>
            <article
              className={`card row clickable ${a.id === selectedAppId ? 'selected' : ''}`}
              onClick={() => onSelectApp(a.id === selectedAppId ? null : a.id)}
            >
              <div className="grow">
                <div className="row-title">
                  <span className={pillClass(a.status)}>{a.stageName}</span>
                  <span className="notif-title">{a.candidateName}</span>
                  <span className="muted small">{a.candidateEmail}</span>
                  <span className="tag">{sourceLabel(a.source)}</span>
                  {a.referralName && (
                    <span className="muted small">ref: {a.referralName}</span>
                  )}
                  {a.hasOffer && a.offerStatus && (
                    <span className={pillClass(a.offerStatus)}>
                      offer {a.offerStatus}
                    </span>
                  )}
                </div>
              </div>
            </article>
            {a.id === selectedAppId && (
              <ApplicationDetail
                token={token}
                applicationId={a.id}
                stages={stages}
                onError={onError}
                onChanged={onChanged}
              />
            )}
          </div>
        ))}
        {apps.length === 0 && canAdd && (
          <p className="muted">No candidates yet. Add one to start the pipeline.</p>
        )}
      </div>
      </div>
    </div>
  );
}

function sourceLabel(source: string): string {
  return SOURCES.find((s) => s.value === source)?.label ?? source;
}

function ApplicationDetail({
  token,
  applicationId,
  stages,
  onError,
  onChanged,
}: {
  token: string;
  applicationId: string;
  stages: PipelineStage[];
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [app, setApp] = useState<Application | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [moveStage, setMoveStage] = useState('');

  const load = useCallback(async () => {
    try {
      const a = await api.application(token, applicationId);
      setApp(a);
      setMoveStage(a.stageId);
      setOffer(a.hasOffer ? await api.offer(token, applicationId) : null);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  }, [token, applicationId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    onError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    }
  };

  if (!app) {
    return <div className="card muted">Loading application...</div>;
  }

  const active = app.status === 'active';

  return (
    <article className="card detail-panel stack">
      <div className="row">
        <div className="grow">
          <div className="row-title">
            <span className={pillClass(app.status)}>{app.status}</span>
            <span className="notif-title">{app.candidateName}</span>
            <span className="muted small">
              {app.candidateEmail}
              {app.candidatePhone ? ` · ${app.candidatePhone}` : ''}
            </span>
          </div>
          <div className="muted small">
            {sourceLabel(app.source)}
            {app.referralName ? ` · referred by ${app.referralName}` : ''} · added{' '}
            {app.createdAt}
          </div>
        </div>
      </div>

      {active && (
        <div className="field-row">
          <div className="field">
            <label>Move to stage</label>
            <select value={moveStage} onChange={(e) => setMoveStage(e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field align-end">
            <button
              className="btn primary"
              disabled={moveStage === app.stageId}
              onClick={() => void act(() => api.moveApplication(token, app.id, moveStage))}
            >
              Move
            </button>
          </div>
          <div className="field align-end">
            <button
              className="btn"
              onClick={() => void act(() => api.rejectApplication(token, app.id))}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <Interviews app={app} token={token} onAct={act} />

      <OfferSection
        app={app}
        offer={offer}
        token={token}
        onAct={act}
      />
    </article>
  );
}

function Interviews({
  app,
  token,
  onAct,
}: {
  app: Application;
  token: string;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({ scheduledAt: '', mode: 'video', interviewerName: '' });
  const interviews = app.interviews ?? [];

  return (
    <div className="stack">
      <h3>Interviews</h3>
      {interviews.map((iv) => (
        <div className="sub-card" key={iv.id}>
          <div className="row-title">
            <span className="tag">{iv.mode}</span>
            <span>{iv.scheduledAt.replace('T', ' ')}</span>
            {iv.interviewerName && (
              <span className="muted small">with {iv.interviewerName}</span>
            )}
          </div>
          <div className="stack scorecards">
            {iv.scorecards.map((c) => (
              <div className="row-title" key={c.id}>
                <span className="tag">{c.rating}/5</span>
                <span className={recClass(c.recommendation)}>
                  {RECOMMENDATIONS.find((r) => r.value === c.recommendation)?.label}
                </span>
                <span className="muted small">{c.reviewerName ?? c.reviewerSub}</span>
                {c.comments && <span>{c.comments}</span>}
              </div>
            ))}
            {app.status === 'active' && (
              <ScorecardForm interviewId={iv.id} token={token} onAct={onAct} />
            )}
          </div>
        </div>
      ))}
      {interviews.length === 0 && (
        <p className="muted small">No interviews scheduled.</p>
      )}

      {app.status === 'active' && (
        <div className="field-row">
          <div className="field">
            <label>Date and time</label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Mode</label>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            >
              <option value="video">Video</option>
              <option value="phone">Phone</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          <div className="field">
            <label>Interviewer</label>
            <input
              value={form.interviewerName}
              onChange={(e) => setForm({ ...form, interviewerName: e.target.value })}
            />
          </div>
          <div className="field align-end">
            <button
              className="btn"
              disabled={!form.scheduledAt}
              onClick={() =>
                void onAct(async () => {
                  await api.scheduleInterview(token, app.id, form);
                  setForm({ scheduledAt: '', mode: 'video', interviewerName: '' });
                })
              }
            >
              Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function recClass(rec: Recommendation): string {
  if (rec === 'strong_yes' || rec === 'yes') return 'pill status-approved';
  return 'pill status-rejected';
}

function ScorecardForm({
  interviewId,
  token,
  onAct,
}: {
  interviewId: string;
  token: string;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [rating, setRating] = useState('4');
  const [recommendation, setRecommendation] = useState<Recommendation>('yes');
  const [comments, setComments] = useState('');

  return (
    <div className="field-row">
      <div className="field">
        <label>Rating</label>
        <select value={rating} onChange={(e) => setRating(e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Recommendation</label>
        <select
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value as Recommendation)}
        >
          {RECOMMENDATIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field grow">
        <label>Comments</label>
        <input value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>
      <div className="field align-end">
        <button
          className="btn small-btn"
          onClick={() =>
            void onAct(async () => {
              await api.addScorecard(token, interviewId, {
                rating: Number(rating),
                recommendation,
                comments: comments.trim() || undefined,
              });
              setComments('');
            })
          }
        >
          Submit scorecard
        </button>
      </div>
    </div>
  );
}

function OfferSection({
  app,
  offer,
  token,
  onAct,
}: {
  app: Application;
  offer: Offer | null;
  token: string;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({ salaryAmount: '', startDate: '' });
  const [signerName, setSignerName] = useState('');

  return (
    <div className="stack">
      <h3>Offer</h3>

      {!offer && app.status === 'active' && (
        <div className="field-row">
          <div className="field">
            <label>Monthly salary</label>
            <input
              value={form.salaryAmount}
              onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Start date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="field align-end">
            <button
              className="btn primary"
              disabled={!form.salaryAmount || !form.startDate}
              onClick={() =>
                void onAct(() =>
                  api.createOffer(token, app.id, {
                    salaryAmount: Number(form.salaryAmount),
                    startDate: form.startDate,
                  }),
                )
              }
            >
              Generate and send offer
            </button>
          </div>
        </div>
      )}

      {offer && (
        <div className="sub-card stack">
          <div className="row-title">
            <span className={pillClass(offer.status)}>{offer.status}</span>
            <span className="notif-title">
              {offer.salaryAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}{' '}
              {offer.currencyCode} / month
            </span>
            <span className="muted small">starts {offer.startDate}</span>
          </div>

          <pre className="letter">{offer.letterBody}</pre>
          <div className="muted small mono">
            document sha-256: {offer.documentHash}
          </div>

          {offer.status === 'signed' && (
            <div className="muted small">
              Signed by {offer.signerName} on{' '}
              {offer.signedAt?.replace('T', ' ')} (IP {offer.signerIp})
            </div>
          )}

          {offer.status === 'sent' && (
            <div className="field-row">
              <div className="field grow">
                <label>Candidate types their full name to accept</label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div className="field align-end">
                <button
                  className="btn primary"
                  disabled={!signerName.trim()}
                  onClick={() => void onAct(() => api.signOffer(token, offer.id, signerName))}
                >
                  Sign offer
                </button>
              </div>
              <div className="field align-end">
                <button
                  className="btn"
                  onClick={() => void onAct(() => api.declineOffer(token, offer.id))}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {offer.status === 'signed' && !offer.employeeId && (
            <div className="actions">
              <button
                className="btn primary"
                onClick={() => void onAct(() => api.convertOffer(token, offer.id))}
              >
                Convert to employee
              </button>
            </div>
          )}

          {offer.employeeId && (
            <div className="muted small">
              Converted to an employee record. Onboarding can begin.
            </div>
          )}
        </div>
      )}

      {!offer && app.status !== 'active' && (
        <p className="muted small">No offer.</p>
      )}
    </div>
  );
}

function NewRequisitionForm({
  token,
  entities,
  departments,
  onCreated,
  onError,
}: {
  token: string;
  entities: LegalEntity[];
  departments: Department[];
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    legalEntityId: '',
    departmentId: '',
    title: '',
    headcount: '1',
    employmentType: 'permanent',
    description: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.legalEntityId || !form.title.trim()) {
      onError('A legal entity and title are required.');
      return;
    }
    const body: CreateRequisitionInput = {
      legalEntityId: form.legalEntityId,
      departmentId: form.departmentId || null,
      title: form.title.trim(),
      headcount: Number(form.headcount) || 1,
      employmentType: form.employmentType,
      description: form.description.trim() || undefined,
    };
    setBusy(true);
    try {
      await api.createRequisition(token, body);
      onCreated();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const entityDepts = departments.filter(
    (d) => !form.legalEntityId || d.legalEntityId === form.legalEntityId,
  );

  return (
    <div className="card form">
      <div className="field-row">
        <div className="field">
          <label>Legal entity</label>
          <select
            value={form.legalEntityId}
            onChange={(e) =>
              setForm({ ...form, legalEntityId: e.target.value, departmentId: '' })
            }
          >
            <option value="">Select entity</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Department</label>
          <select
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
          >
            <option value="">None</option>
            {entityDepts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Headcount</label>
          <input
            type="number"
            min={1}
            value={form.headcount}
            onChange={(e) => setForm({ ...form, headcount: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Employment type</label>
          <select
            value={form.employmentType}
            onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
          >
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
          </select>
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
        <button className="btn primary" disabled={busy} onClick={() => void submit()}>
          Create draft
        </button>
      </div>
    </div>
  );
}

function NewCandidateForm({
  token,
  requisitionId,
  employees,
  onCreated,
  onError,
}: {
  token: string;
  requisitionId: string;
  employees: Employee[];
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    candidateName: '',
    candidateEmail: '',
    candidatePhone: '',
    source: 'direct' as ApplicationSource,
    referralEmployeeId: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.candidateName.trim() || !form.candidateEmail.trim()) {
      onError('Candidate name and email are required.');
      return;
    }
    setBusy(true);
    try {
      await api.createApplication(token, {
        requisitionId,
        candidateName: form.candidateName.trim(),
        candidateEmail: form.candidateEmail.trim(),
        candidatePhone: form.candidatePhone.trim() || undefined,
        source: form.source,
        referralEmployeeId:
          form.source === 'referral' ? form.referralEmployeeId || null : null,
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
        <div className="field">
          <label>Candidate name</label>
          <input
            value={form.candidateName}
            onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            value={form.candidateEmail}
            onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Phone</label>
          <input
            value={form.candidatePhone}
            onChange={(e) => setForm({ ...form, candidatePhone: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Source</label>
          <select
            value={form.source}
            onChange={(e) =>
              setForm({ ...form, source: e.target.value as ApplicationSource })
            }
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {form.source === 'referral' && (
          <div className="field">
            <label>Referred by</label>
            <select
              value={form.referralEmployeeId}
              onChange={(e) =>
                setForm({ ...form, referralEmployeeId: e.target.value })
              }
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void submit()}>
          Add candidate
        </button>
      </div>
    </div>
  );
}
