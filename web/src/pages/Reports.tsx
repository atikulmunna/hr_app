import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  Department,
  LegalEntity,
  ReportDataset,
  ReportExportFormat,
  ReportFilterDef,
  ReportResult,
  ReportSpec,
  api,
} from '../api';

// Custom report builder (T-2.7, FR-M10-03). Pick a dataset, filter it, optionally
// group it, preview, and export to CSV, Excel, or PDF.
export function Reports({ token }: { token: string }) {
  const [datasets, setDatasets] = useState<ReportDataset[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [datasetKey, setDatasetKey] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ds, ent, dep] = await Promise.all([
          api.reportDatasets(token),
          api.entities(token),
          api.departments(token),
        ]);
        setDatasets(ds);
        setEntities(ent);
        setDepartments(dep);
        if (ds[0]) {
          setDatasetKey(ds[0].key);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    })();
  }, [token]);

  const dataset = useMemo(
    () => datasets.find((d) => d.key === datasetKey),
    [datasets, datasetKey],
  );

  // Switching datasets clears filters and grouping, which belong to the old one.
  const pickDataset = (key: string) => {
    setDatasetKey(key);
    setFilters({});
    setGroupBy('');
    setResult(null);
  };

  const spec = useCallback((): ReportSpec => {
    const active: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) {
        active[k] = v;
      }
    }
    return {
      dataset: datasetKey,
      filters: active,
      groupBy: groupBy || undefined,
    };
  }, [datasetKey, filters, groupBy]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.runReport(token, spec()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: ReportExportFormat) => {
    setError(null);
    try {
      const blob = await api.exportReport(token, spec(), format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${datasetKey}-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') {
      return Number.isInteger(v)
        ? v.toLocaleString()
        : v.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }
    return String(v);
  };

  return (
    <section className="stack">
      <div>
        <h2>Report builder</h2>
        <p className="muted small">
          Pick a dataset, narrow it with filters, optionally group it, then
          export to CSV, Excel, or PDF. Grouping collapses the rows to a count
          per group (plus sums for payroll); leave it ungrouped for the full
          detail columns. Payroll sums stay within each currency.
        </p>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="card form">
        <div className="field-row">
          <div className="field">
            <label>Dataset</label>
            <select
              value={datasetKey}
              onChange={(e) => pickDataset(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Group by</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="">No grouping (detail rows)</option>
              {dataset?.dimensions.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {dataset && dataset.filters.length > 0 && (
          <div className="field-row">
            {dataset.filters.map((f) => (
              <FilterField
                key={f.key}
                def={f}
                value={filters[f.key] ?? ''}
                entities={entities}
                departments={departments}
                onChange={(v) => setFilters((cur) => ({ ...cur, [f.key]: v }))}
              />
            ))}
          </div>
        )}

        <div className="actions">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void run()}
          >
            Run report
          </button>
          <button
            className="btn"
            disabled={!result}
            onClick={() => void download('csv')}
          >
            CSV
          </button>
          <button
            className="btn"
            disabled={!result}
            onClick={() => void download('xlsx')}
          >
            Excel
          </button>
          <button
            className="btn"
            disabled={!result}
            onClick={() => void download('pdf')}
          >
            PDF
          </button>
        </div>
      </div>

      {result && (
        <article className="card">
          <div className="chart-title">
            {result.label}{' '}
            <span className="muted small">
              {result.grouped ? 'grouped' : 'detail'} · {result.rows.length}{' '}
              rows
            </span>
          </div>
          {result.rows.length === 0 ? (
            <p className="muted">No rows match these filters.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c.key}>{cell(row[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}
    </section>
  );
}

function FilterField({
  def,
  value,
  entities,
  departments,
  onChange,
}: {
  def: ReportFilterDef;
  value: string;
  entities: LegalEntity[];
  departments: Department[];
  onChange: (value: string) => void;
}) {
  if (def.type === 'dateFrom' || def.type === 'dateTo') {
    return (
      <div className="field">
        <label>{def.label}</label>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  const options =
    def.type === 'entity'
      ? entities.map((e) => ({ value: e.id, label: e.name }))
      : def.type === 'department'
        ? departments.map((d) => ({ value: d.id, label: d.name }))
        : (def.options ?? []).map((o) => ({ value: o, label: o }));
  return (
    <div className="field">
      <label>{def.label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
