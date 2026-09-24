import { useCallback } from 'react';
import { TeamAttendanceRow, TeamLeaveRow, TeamMember, api } from '../api';
import { useRequest } from '../lib/useRequest';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysAhead(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const STATUS: Record<string, { label: string; cls: string }> = {
  checked_in: { label: 'Checked in', cls: 'day-present' },
  checked_out: { label: 'Checked out', cls: 'day-present' },
  absent: { label: 'Absent', cls: 'day-absent' },
  leave: { label: 'On leave', cls: 'day-leave' },
  not_in: { label: 'Not in yet', cls: 'day-scheduled' },
};

export function Team({ token }: { token: string }) {
  const fetchTeam = useCallback(async () => {
    const [reports, attendance, leave] = await Promise.all([
      api.team(token),
      api.teamAttendance(token, daysAgo(13), daysAgo(0)),
      api.teamLeave(token, daysAgo(0), daysAhead(60)),
    ]);
    return { reports, attendance, leave };
  }, [token]);
  const { data, error, loading } = useRequest(fetchTeam);
  const reports: TeamMember[] = data?.reports ?? [];
  const attendance: TeamAttendanceRow[] = data?.attendance ?? [];
  const leave: TeamLeaveRow[] = data?.leave ?? [];

  return (
    <section className="stack">
      <div className="section-head">
        <h2>My team</h2>
      </div>
      {error && <div className="banner error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}

      {!loading && reports.length === 0 && !error && (
        <p className="muted">You have no direct reports.</p>
      )}

      {reports.length > 0 && (
        <div className="card">
          <h3>Direct reports</h3>
          {reports.map((r) => {
            const s = STATUS[r.todayStatus] ?? {
              label: r.todayStatus,
              cls: 'day-scheduled',
            };
            return (
              <div className="line" key={r.id}>
                <span className={`pill ${s.cls}`}>{s.label}</span>
                <span className="grow">
                  {r.firstName} {r.lastName}{' '}
                  <span className="muted small">
                    {r.jobTitle ?? r.employeeCode}
                  </span>
                </span>
                <span className="muted small">{r.shiftName ?? 'No shift'}</span>
              </div>
            );
          })}
        </div>
      )}

      {attendance.length > 0 && (
        <div className="card">
          <h3>Team attendance (last 14 days)</h3>
          {attendance.map((a) => (
            <div className="line" key={a.employeeId}>
              <span className="grow">
                {a.firstName} {a.lastName}
              </span>
              <span className="muted small">
                present {a.totals.presentDays} · late {a.totals.lateDays} ·
                absent {a.totals.absentDays} · leave {a.totals.leaveDays} ·{' '}
                {a.totals.workedHours} h
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Team leave (next 60 days)</h3>
        {leave.length === 0 && (
          <p className="muted small">No upcoming leave.</p>
        )}
        {leave.map((l) => (
          <div className="line" key={l.id}>
            <span className={`pill status-${l.status}`}>{l.status}</span>
            <span className="grow">
              {l.name}{' '}
              <span className="muted small">
                {l.typeCode} · {l.startDate} to {l.endDate}
              </span>
            </span>
            <span className="muted small">{l.workingDays} d</span>
          </div>
        ))}
      </div>
    </section>
  );
}
