import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AbsenceAnalytics,
  ApiError,
  AttritionAnalytics,
  CostToCompanyAnalytics,
  DeviceRebinds,
  FlagRateByTeam,
  HeadcountAnalytics,
  OvertimeAnalytics,
  Regularizations,
  RepeatSignals,
  api,
} from '../api';

// Standard HR dashboards (T-2.7, FR-M10-01). Read-only aggregates over payroll,
// attendance, and employee data. Cost is shown per legal entity in its own
// currency: the system holds no FX rates, so figures are never converted or
// summed across currencies.

// Categorical slots 1 and 2 from the validated data-viz palette (a pre-checked
// adjacent pair). One series uses SERIES_1 alone and needs no legend.
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#008300';
const GRID = '#e4e1d7';
const AXIS = '#8a8a80';

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS, fontSize: 12 },
  tickLine: false,
};

export function Analytics({ token }: { token: string }) {
  const [months, setMonths] = useState(12);
  const [headcount, setHeadcount] = useState<HeadcountAnalytics | null>(null);
  const [attrition, setAttrition] = useState<AttritionAnalytics | null>(null);
  const [absence, setAbsence] = useState<AbsenceAnalytics | null>(null);
  const [overtime, setOvertime] = useState<OvertimeAnalytics | null>(null);
  const [ctc, setCtc] = useState<CostToCompanyAnalytics | null>(null);
  const [flagRate, setFlagRate] = useState<FlagRateByTeam | null>(null);
  const [repeat, setRepeat] = useState<RepeatSignals | null>(null);
  const [rebinds, setRebinds] = useState<DeviceRebinds | null>(null);
  const [regs, setRegs] = useState<Regularizations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [h, at, ab, ot, cc, fr, rs, rb, rg] = await Promise.all([
        api.analyticsHeadcount(token),
        api.analyticsAttrition(token, months),
        api.analyticsAbsence(token, months),
        api.analyticsOvertime(token, months),
        api.analyticsCostToCompany(token, months),
        api.analyticsFlagRateByTeam(token, months),
        api.analyticsRepeatSignals(token, months),
        api.analyticsDeviceRebinds(token, months),
        api.analyticsRegularizations(token, months),
      ]);
      setHeadcount(h);
      setAttrition(at);
      setAbsence(ab);
      setOvertime(ot);
      setCtc(cc);
      setFlagRate(fr);
      setRepeat(rs);
      setRebinds(rb);
      setRegs(rg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, months]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="muted">Loading...</p>;
  }

  const money = (n: number, currency: string) =>
    `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;

  return (
    <section className="stack">
      {error && <div className="banner error">{error}</div>}

      <div className="section-head">
        <h2>HR analytics</h2>
        <div className="field" style={{ maxWidth: 180 }}>
          <label>Window</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        </div>
      </div>

      <div className="kpi-row">
        <Tile label="Headcount" value={headcount?.total ?? 0} />
        <Tile
          label="Attrition"
          value={`${attrition?.rate ?? 0}%`}
          hint={`${attrition?.leavers ?? 0} leavers / ${attrition?.months ?? months} mo`}
        />
        <Tile
          label="Absence days"
          value={absence?.totalAbsence ?? 0}
          hint={`${absence?.totalLeave ?? 0} approved leave days`}
        />
        <Tile
          label="Overtime hours"
          value={overtime?.totalHours ?? 0}
          hint="paid into runs"
        />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Headcount trend"
          subtitle="Active employees at each month end (last 12 months)"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={headcount?.trend ?? []}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis allowDecimals={false} width={32} {...axisProps} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="headcount"
                name="Headcount"
                stroke={SERIES_1}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Headcount by entity"
          subtitle="Currently active employees"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={headcount?.byEntity ?? []}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis allowDecimals={false} width={32} {...axisProps} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar
                dataKey="headcount"
                name="Headcount"
                fill={SERIES_1}
                radius={[4, 4, 0, 0]}
                maxBarSize={64}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Joiners and leavers"
          subtitle={`Per month over the last ${months} months`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={attrition?.series ?? []}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis allowDecimals={false} width={32} {...axisProps} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend />
              <Bar
                dataKey="joiners"
                name="Joiners"
                fill={SERIES_1}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="leavers"
                name="Leavers"
                fill={SERIES_2}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Absence and leave"
          subtitle={`Days per month over the last ${months} months`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={absence?.series ?? []}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis allowDecimals={false} width={32} {...axisProps} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend />
              <Bar
                dataKey="absenceDays"
                name="Absence"
                fill={SERIES_1}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="leaveDays"
                name="Approved leave"
                fill={SERIES_2}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Overtime hours"
          subtitle={`Paid into runs, per month over the last ${months} months`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={overtime?.series ?? []}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis allowDecimals={false} width={32} {...axisProps} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="hours"
                name="Overtime hours"
                stroke={SERIES_1}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div>
        <h3>Cost to company</h3>
        <p className="muted small">
          Gross pay plus employer contributions and settled adjustments, per legal
          entity in its own currency. Figures are not converted or summed across
          currencies.
        </p>
        {(ctc?.entities.length ?? 0) === 0 && (
          <p className="muted">No payroll runs in this window yet.</p>
        )}
        <div className="chart-grid">
          {ctc?.entities.map((e) => (
            <ChartCard
              key={e.legalEntityId}
              title={e.name}
              subtitle={`Cost to company (${e.currencyCode})`}
            >
              <div className="kpi-row tight">
                <Tile label="Gross" value={money(e.gross, e.currencyCode)} />
                <Tile
                  label="Employer"
                  value={money(e.employer, e.currencyCode)}
                />
                <Tile label="Total CTC" value={money(e.ctc, e.currencyCode)} />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={e.series}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis
                    width={48}
                    {...axisProps}
                    tickFormatter={(v: number) => v.toLocaleString()}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v), e.currencyCode)}
                  />
                  <Line
                    type="monotone"
                    dataKey="ctc"
                    name={`CTC (${e.currencyCode})`}
                    stroke={SERIES_1}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ))}
        </div>
      </div>

      <div className="stack">
        <div>
          <h3>Fraud signals</h3>
          <p className="muted small">
            Attendance integrity, so a team or person gaming the marks stands out.
            A mark is "flagged" when its risk band is not clean. Regularizations
            and re-binds are surfaced here so neither becomes a routine bypass.
          </p>
        </div>

        <div className="kpi-row">
          <Tile
            label="Flag rate"
            value={`${flagRate?.rate ?? 0}%`}
            hint={`${flagRate?.flagged ?? 0} of ${flagRate?.marks ?? 0} marks`}
          />
          <Tile label="Red marks" value={flagRate?.red ?? 0} hint="highest risk band" />
          <Tile label="Device re-binds" value={rebinds?.total ?? 0} />
          <Tile label="Regularizations" value={regs?.total ?? 0} />
        </div>

        <div className="chart-grid">
          <ChartCard
            title="Flag rate by team"
            subtitle="Share of marks flagged, per department"
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={flagRate?.byTeam ?? []}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="team" {...axisProps} />
                <YAxis
                  width={40}
                  {...axisProps}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(v) => `${Number(v)}%`}
                />
                <Bar
                  dataKey="rate"
                  name="Flag rate"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Device re-binds"
            subtitle={`Per month over the last ${months} months`}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rebinds?.series ?? []}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis allowDecimals={false} width={32} {...axisProps} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar
                  dataKey="rebinds"
                  name="Re-binds"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Regularizations"
            subtitle={`Per month over the last ${months} months`}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={regs?.series ?? []}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis allowDecimals={false} width={32} {...axisProps} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar
                  dataKey="regularizations"
                  name="Regularizations"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <article className="card">
          <div className="chart-title">Repeat-signal employees</div>
          <div className="muted small">Most flagged marks first</div>
          {(repeat?.employees.length ?? 0) === 0 ? (
            <p className="muted">No flagged marks in this window.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Flagged</th>
                  <th className="num">Red</th>
                  <th className="num">Marks</th>
                  <th>Last flagged</th>
                </tr>
              </thead>
              <tbody>
                {repeat?.employees.map((e) => (
                  <tr key={e.employeeId}>
                    <td>
                      {e.employeeName}{' '}
                      <span className="muted small">{e.employeeCode}</span>
                    </td>
                    <td className="num">{e.flagged}</td>
                    <td className="num">{e.red}</td>
                    <td className="num">{e.marks}</td>
                    <td className="muted small">{e.lastFlagged ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <div className="chart-grid">
          <WatchlistTable
            title="Frequent re-binders"
            unit="re-binds"
            rows={(rebinds?.byEmployee ?? []).map((e) => ({
              id: e.employeeId,
              name: e.employeeName,
              code: e.employeeCode,
              count: e.rebinds,
              last: e.lastRebind,
            }))}
          />
          <WatchlistTable
            title="Frequent regularizers"
            unit="regularizations"
            rows={(regs?.byEmployee ?? []).map((e) => ({
              id: e.employeeId,
              name: e.employeeName,
              code: e.employeeCode,
              count: e.regularizations,
              last: e.lastRequest,
            }))}
          />
        </div>
      </div>
    </section>
  );
}

function WatchlistTable({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: {
    id: string;
    name: string;
    code: string;
    count: number;
    last: string | null;
  }[];
}) {
  return (
    <article className="card">
      <div className="chart-title">{title}</div>
      {rows.length === 0 ? (
        <p className="muted">None in this window.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">{unit}</th>
              <th>Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name} <span className="muted small">{r.code}</span>
                </td>
                <td className="num">{r.count}</td>
                <td className="muted small">{r.last ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="kpi-tile">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="card">
      <div className="chart-title">{title}</div>
      {subtitle && <div className="muted small">{subtitle}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </article>
  );
}
