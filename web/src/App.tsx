import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Approvals } from './pages/Approvals';
import { Config } from './pages/Config';
import { Documents } from './pages/Documents';
import { Employees } from './pages/Employees';
import { Geofences } from './pages/Geofences';
import { Inbox } from './pages/Inbox';
import { Leave } from './pages/Leave';
import { Learning } from './pages/Learning';
import { Lifecycle } from './pages/Lifecycle';
import { Analytics } from './pages/Analytics';
import { Payroll } from './pages/Payroll';
import { Performance } from './pages/Performance';
import { Recruitment } from './pages/Recruitment';
import { Reports } from './pages/Reports';
import { Review } from './pages/Review';
import { Shifts } from './pages/Shifts';
import { Team } from './pages/Team';

type Tab =
  | 'approvals'
  | 'review'
  | 'inbox'
  | 'team'
  | 'employees'
  | 'lifecycle'
  | 'geofences'
  | 'leave'
  | 'shifts'
  | 'payroll'
  | 'recruitment'
  | 'performance'
  | 'learning'
  | 'documents'
  | 'analytics'
  | 'reports'
  | 'config';

const TABS: { key: Tab; label: string }[] = [
  { key: 'approvals', label: 'Approvals' },
  { key: 'review', label: 'Review' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'team', label: 'Team' },
  { key: 'employees', label: 'Employees' },
  { key: 'lifecycle', label: 'Lifecycle' },
  { key: 'geofences', label: 'Geofences' },
  { key: 'leave', label: 'Leave' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'performance', label: 'Performance' },
  { key: 'learning', label: 'Learning' },
  { key: 'documents', label: 'Documents' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'reports', label: 'Reports' },
  { key: 'config', label: 'Config' },
];

const TAB_STORAGE_KEY = 'hris.console.tab';

function initialTab(): Tab {
  const saved = localStorage.getItem(TAB_STORAGE_KEY);
  return TABS.some((t) => t.key === saved) ? (saved as Tab) : 'approvals';
}

export default function App() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  }, [tab]);

  if (auth.isLoading) {
    return <div className="center muted">Loading...</div>;
  }
  if (auth.error) {
    return (
      <div className="center error">Sign-in error: {auth.error.message}</div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="center">
        <div className="card login">
          <h1>HR Console</h1>
          <p className="muted">Sign in to review approvals and attendance.</p>
          <button
            className="btn primary"
            onClick={() => void auth.signinRedirect()}
          >
            Sign in with Keycloak
          </button>
        </div>
      </div>
    );
  }

  const profile = auth.user?.profile;
  const name = profile?.preferred_username ?? profile?.name ?? 'HR user';

  const token = auth.user!.access_token;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">HR Console</div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`nav-item ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted small">{name}</span>
          <button className="btn" onClick={() => void auth.signoutRedirect()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="main-inner">
          {tab === 'approvals' && <Approvals token={token} />}
          {tab === 'review' && <Review token={token} />}
          {tab === 'inbox' && <Inbox token={token} />}
          {tab === 'team' && <Team token={token} />}
          {tab === 'employees' && <Employees token={token} />}
          {tab === 'lifecycle' && <Lifecycle token={token} />}
          {tab === 'geofences' && <Geofences token={token} />}
          {tab === 'leave' && <Leave token={token} />}
          {tab === 'shifts' && <Shifts token={token} />}
          {tab === 'payroll' && <Payroll token={token} />}
          {tab === 'recruitment' && <Recruitment token={token} />}
          {tab === 'performance' && <Performance token={token} />}
          {tab === 'learning' && <Learning token={token} />}
          {tab === 'documents' && <Documents token={token} />}
          {tab === 'analytics' && <Analytics token={token} />}
          {tab === 'reports' && <Reports token={token} />}
          {tab === 'config' && <Config token={token} />}
        </div>
      </main>
    </div>
  );
}
