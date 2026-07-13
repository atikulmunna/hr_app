import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Approvals } from './pages/Approvals';
import { Employees } from './pages/Employees';
import { Geofences } from './pages/Geofences';
import { Inbox } from './pages/Inbox';
import { Leave } from './pages/Leave';
import { Review } from './pages/Review';
import { Shifts } from './pages/Shifts';

type Tab =
  | 'approvals'
  | 'review'
  | 'inbox'
  | 'employees'
  | 'geofences'
  | 'leave'
  | 'shifts';

export default function App() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('approvals');

  if (auth.isLoading) {
    return <div className="center muted">Loading...</div>;
  }
  if (auth.error) {
    return <div className="center error">Sign-in error: {auth.error.message}</div>;
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="center">
        <div className="card login">
          <h1>HR Console</h1>
          <p className="muted">Sign in to review approvals and attendance.</p>
          <button className="btn primary" onClick={() => void auth.signinRedirect()}>
            Sign in with Keycloak
          </button>
        </div>
      </div>
    );
  }

  const profile = auth.user?.profile;
  const name = profile?.preferred_username ?? profile?.name ?? 'HR user';

  return (
    <div className="app">
      <header className="topbar">
        <strong>HR Console</strong>
        <nav className="tabs">
          <button
            className={`tab ${tab === 'approvals' ? 'active' : ''}`}
            onClick={() => setTab('approvals')}
          >
            Approvals
          </button>
          <button
            className={`tab ${tab === 'review' ? 'active' : ''}`}
            onClick={() => setTab('review')}
          >
            Review
          </button>
          <button
            className={`tab ${tab === 'inbox' ? 'active' : ''}`}
            onClick={() => setTab('inbox')}
          >
            Inbox
          </button>
          <button
            className={`tab ${tab === 'employees' ? 'active' : ''}`}
            onClick={() => setTab('employees')}
          >
            Employees
          </button>
          <button
            className={`tab ${tab === 'geofences' ? 'active' : ''}`}
            onClick={() => setTab('geofences')}
          >
            Geofences
          </button>
          <button
            className={`tab ${tab === 'leave' ? 'active' : ''}`}
            onClick={() => setTab('leave')}
          >
            Leave
          </button>
          <button
            className={`tab ${tab === 'shifts' ? 'active' : ''}`}
            onClick={() => setTab('shifts')}
          >
            Shifts
          </button>
        </nav>
        <div className="spacer" />
        <span className="muted">{name}</span>
        <button className="btn" onClick={() => void auth.removeUser()}>
          Sign out
        </button>
      </header>
      <main className="content">
        {tab === 'approvals' && <Approvals token={auth.user!.access_token} />}
        {tab === 'review' && <Review token={auth.user!.access_token} />}
        {tab === 'inbox' && <Inbox token={auth.user!.access_token} />}
        {tab === 'employees' && <Employees token={auth.user!.access_token} />}
        {tab === 'geofences' && <Geofences token={auth.user!.access_token} />}
        {tab === 'leave' && <Leave token={auth.user!.access_token} />}
        {tab === 'shifts' && <Shifts token={auth.user!.access_token} />}
      </main>
    </div>
  );
}
