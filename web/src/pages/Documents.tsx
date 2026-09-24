import { useCallback, useEffect, useState } from 'react';
import {
  DocumentDetail,
  DocumentSummary,
  DocumentVisibility,
  Employee,
  MyDocument,
  api,
} from '../api';
import { errorMessage } from '../lib/errors';

const CATEGORIES = [
  'contract',
  'policy',
  'letter',
  'id_proof',
  'visa',
  'work_permit',
  'certificate',
  'other',
];

const VISIBILITIES: { value: DocumentVisibility; label: string }[] = [
  { value: 'hr_only', label: 'HR only' },
  { value: 'employee', label: 'Employee (self-service)' },
  { value: 'all', label: 'Everyone (org-wide)' },
];

// Compute a file's SHA-256 in the browser so the vault stores the hash without
// ever uploading the bytes (T-3.4, metadata-and-hash model).
async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fail(onError: (m: string) => void, e: unknown) {
  onError(errorMessage(e));
}

// Documents and compliance (T-3.4, FR-M1-07, 08, 09). HR keeps a versioned
// document vault with access control and expiry reminders; employees see the
// documents shared with them and e-sign policy acknowledgements.
export function Documents({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack">
      {error && <div className="banner error">{error}</div>}
      <VaultPanel token={token} onError={setError} />
      <MyDocumentsPanel token={token} onError={setError} />
    </div>
  );
}

function VaultPanel({
  token,
  onError,
}: {
  token: string;
  onError: (m: string) => void;
}) {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, emps] = await Promise.all([
        api.documents(token, {
          employeeId: employeeId || undefined,
          category: category || undefined,
        }),
        api.employees(token),
      ]);
      setDocs(list);
      setEmployees(emps);
    } catch (e) {
      fail(onError, e);
    }
  }, [token, onError, employeeId, category]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="section-head">
        <h2>Document vault</h2>
        <button
          className="btn primary small-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : 'New document'}
        </button>
      </div>
      <p className="muted small">
        Versioned documents with access control. Only the file hash is stored,
        not the file. A document within 30 days of expiry (or expired) raises a
        one-time reminder for HR and the employee. Select one to see its
        versions and signatures.
      </p>

      <div className="stack">
        {showForm && (
          <NewDocumentForm
            token={token}
            employees={employees}
            onError={onError}
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
          />
        )}

        <div className="field-row">
          <div className="field">
            <label>Filter by employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">All (incl. org-wide)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Filter by category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="list">
          {docs.map((d) => (
            <div key={d.id}>
              <article
                className={`card row top clickable ${d.id === selectedId ? 'selected' : ''}`}
                onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
              >
                <div className="grow">
                  <div className="row-title">
                    <span className={statusPill(d.status)}>
                      {statusLabel(d)}
                    </span>
                    <span className="notif-title">{d.name}</span>
                    <span className="tag">{d.category}</span>
                    <span className="tag">{visibilityLabel(d.visibility)}</span>
                    {d.requiresAcknowledgement && (
                      <span className="pill status-pending">
                        needs signature
                      </span>
                    )}
                  </div>
                  <div className="muted small">
                    {d.employeeName
                      ? `${d.employeeName} (${d.employeeCode})`
                      : 'Org-wide'}{' '}
                    · v{d.currentVersion} ({d.versionCount} version
                    {d.versionCount === 1 ? '' : 's'})
                    {d.expiresOn ? ` · expires ${d.expiresOn}` : ''}
                    {d.requiresAcknowledgement
                      ? ` · ${d.acknowledgedCount} signed`
                      : ''}
                  </div>
                </div>
              </article>
              {d.id === selectedId && (
                <DocumentDetailPanel
                  token={token}
                  documentId={d.id}
                  onError={onError}
                  onChanged={load}
                />
              )}
            </div>
          ))}
          {docs.length === 0 && <p className="muted">No documents yet.</p>}
        </div>
      </div>
    </div>
  );
}

function DocumentDetailPanel({
  token,
  documentId,
  onError,
  onChanged,
}: {
  token: string;
  documentId: string;
  onError: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.document(token, documentId));
    } catch (e) {
      fail(onError, e);
    }
  }, [token, documentId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    onError('');
    try {
      await api.removeDocument(token, documentId);
      await onChanged();
    } catch (e) {
      fail(onError, e);
    }
  };

  if (!detail) {
    return <div className="card muted">Loading document...</div>;
  }

  return (
    <article className="card detail-panel stack">
      <div className="stack">
        <h3>Versions</h3>
        <div className="list">
          {detail.versions.map((v) => (
            <div className="sub-card" key={v.id}>
              <div className="row-title">
                <span className="tag">v{v.version}</span>
                <span className="muted small">
                  {v.createdAt.replace('T', ' ')}
                </span>
                {v.note && <span>{v.note}</span>}
              </div>
              <div className="muted small mono">sha-256: {v.sha256}</div>
            </div>
          ))}
        </div>
        <AddVersionForm
          token={token}
          documentId={documentId}
          onError={onError}
          onDone={async () => {
            await load();
            await onChanged();
          }}
        />
      </div>

      <div className="stack">
        <h3>Signatures</h3>
        <div className="list">
          {detail.acknowledgements.map((a) => (
            <div className="sub-card" key={a.id}>
              <div className="row-title">
                <span className="pill status-approved">signed</span>
                <span className="notif-title">{a.signerName}</span>
                <span className="tag">v{a.version}</span>
                <span className="muted small">
                  {a.signedAt.replace('T', ' ')}
                  {a.signerIp ? ` · IP ${a.signerIp}` : ''}
                </span>
              </div>
              <div className="muted small mono">signed hash: {a.sha256}</div>
            </div>
          ))}
          {detail.acknowledgements.length === 0 && (
            <p className="muted small">No signatures yet.</p>
          )}
        </div>
      </div>

      <div className="actions">
        <button className="btn" onClick={() => void remove()}>
          Delete document
        </button>
      </div>
    </article>
  );
}

function AddVersionForm({
  token,
  documentId,
  onError,
  onDone,
}: {
  token: string;
  documentId: string;
  onError: (m: string) => void;
  onDone: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) {
      onError('Choose a file to derive its hash for the new version.');
      return;
    }
    setBusy(true);
    onError('');
    try {
      const sha256 = await sha256Hex(file);
      await api.addDocumentVersion(token, documentId, {
        sha256,
        note: note.trim() || undefined,
        expiresOn: expiresOn || undefined,
      });
      setFile(null);
      setNote('');
      setExpiresOn('');
      await onDone();
    } catch (e) {
      fail(onError, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field-row">
      <div className="field grow">
        <label>New version file</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="field grow">
        <label>Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="field">
        <label>New expiry (optional)</label>
        <input
          type="date"
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
        />
      </div>
      <div className="field align-end">
        <button
          className="btn primary"
          disabled={busy || !file}
          onClick={() => void submit()}
        >
          Add version
        </button>
      </div>
    </div>
  );
}

function NewDocumentForm({
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
    category: 'contract',
    visibility: 'hr_only' as DocumentVisibility,
    requiresAcknowledgement: false,
    expiresOn: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      onError('A document needs a name.');
      return;
    }
    if (!file) {
      onError('Choose a file to derive its hash.');
      return;
    }
    setBusy(true);
    onError('');
    try {
      const sha256 = await sha256Hex(file);
      await api.createDocument(token, {
        employeeId: form.employeeId || null,
        name: form.name.trim(),
        category: form.category,
        docType: file.type || undefined,
        visibility: form.visibility,
        requiresAcknowledgement: form.requiresAcknowledgement,
        sha256,
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
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Visibility</label>
          <select
            value={form.visibility}
            onChange={(e) =>
              setForm({
                ...form,
                visibility: e.target.value as DocumentVisibility,
              })
            }
          >
            {VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field grow">
          <label>Employee (blank for org-wide)</label>
          <select
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">Org-wide (no employee)</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} ({emp.employeeCode})
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>File (hashed in your browser)</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="field">
          <label>Expiry (optional)</label>
          <input
            type="date"
            value={form.expiresOn}
            onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          />
        </div>
      </div>
      <div className="field-row">
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          className="muted small"
        >
          <input
            type="checkbox"
            checked={form.requiresAcknowledgement}
            onChange={(e) =>
              setForm({ ...form, requiresAcknowledgement: e.target.checked })
            }
          />
          Requires the employee to e-sign (policy or letter)
        </label>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          Add document
        </button>
      </div>
    </div>
  );
}

function MyDocumentsPanel({
  token,
  onError,
}: {
  token: string;
  onError: (m: string) => void;
}) {
  const [docs, setDocs] = useState<MyDocument[]>([]);

  const load = useCallback(async () => {
    try {
      setDocs(await api.myDocuments(token));
    } catch (e) {
      fail(onError, e);
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="section-head">
        <h2>My documents</h2>
      </div>
      <p className="muted small">
        Documents shared with you. Policies and letters that need a signature
        are e-signed by typing your full name, the same click-to-sign used for
        offers.
      </p>

      <div className="stack">
        <div className="list">
          {docs.map((d) => (
            <MyDocumentCard
              key={d.id}
              token={token}
              doc={d}
              onError={onError}
              onSigned={load}
            />
          ))}
          {docs.length === 0 && (
            <p className="muted">No documents are shared with you.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MyDocumentCard({
  token,
  doc,
  onError,
  onSigned,
}: {
  token: string;
  doc: MyDocument;
  onError: (m: string) => void;
  onSigned: () => Promise<void>;
}) {
  const [signerName, setSignerName] = useState('');
  const [busy, setBusy] = useState(false);

  const sign = async () => {
    if (!signerName.trim()) {
      onError('Type your full name to sign.');
      return;
    }
    setBusy(true);
    onError('');
    try {
      await api.acknowledgeDocument(token, doc.id, signerName.trim());
      await onSigned();
    } catch (e) {
      fail(onError, e);
    } finally {
      setBusy(false);
    }
  };

  const needsSignature = doc.requiresAcknowledgement && !doc.acknowledged;

  return (
    <article className="card row top">
      <div className="grow">
        <div className="row-title">
          {doc.requiresAcknowledgement && (
            <span
              className={
                doc.acknowledged
                  ? 'pill status-approved'
                  : 'pill status-pending'
              }
            >
              {doc.acknowledged ? 'signed' : 'needs signature'}
            </span>
          )}
          <span className="notif-title">{doc.name}</span>
          <span className="tag">{doc.category}</span>
          {doc.expiresOn && (
            <span className="muted small">expires {doc.expiresOn}</span>
          )}
        </div>
        {doc.acknowledged && doc.signedAt && (
          <div className="muted small">
            Signed on {doc.signedAt.replace('T', ' ')}. The signature is
            recorded against this document in the vault.
          </div>
        )}
        {needsSignature && (
          <div className="field-row">
            <div className="field grow">
              <label>Type your full name to sign</label>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
              />
            </div>
            <div className="field align-end">
              <button
                className="btn primary"
                disabled={busy || !signerName.trim()}
                onClick={() => void sign()}
              >
                Sign
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function statusPill(status: string): string {
  if (status === 'valid') return 'pill status-approved';
  if (status === 'expiring') return 'pill status-pending';
  return 'pill status-rejected';
}

function statusLabel(d: DocumentSummary): string {
  if (!d.expiresOn) return 'no expiry';
  if (d.status === 'expired') return 'expired';
  if (d.status === 'expiring') {
    return d.daysToExpiry != null
      ? `expires in ${d.daysToExpiry}d`
      : 'expiring';
  }
  return 'valid';
}

function visibilityLabel(v: DocumentVisibility): string {
  return VISIBILITIES.find((x) => x.value === v)?.label ?? v;
}
