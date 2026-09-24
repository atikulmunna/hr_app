import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { hasPermission } from './lib/permissions';
import { useRequest } from './lib/useRequest';
import { NAV } from './nav';

export default function App() {
  const auth = useAuth();

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
  return (
    <Console
      token={auth.user!.access_token}
      name={profile?.preferred_username ?? profile?.name ?? 'HR user'}
      onSignOut={() => void auth.signoutRedirect()}
    />
  );
}

function Console({
  token,
  name,
  onSignOut,
}: {
  token: string;
  name: string;
  onSignOut: () => void;
}) {
  const fetchMe = useCallback(() => api.me(token), [token]);
  const { data: me, error, loading } = useRequest(fetchMe);

  if (loading) {
    return <div className="center muted">Loading...</div>;
  }
  // Without the caller's permissions there is no honest way to decide which
  // pages to offer, so the console says so instead of showing all of them.
  if (error || !me) {
    return (
      <div className="center error">
        Could not load your profile: {error ?? 'the API returned nothing'}
      </div>
    );
  }

  const pages = NAV.filter(
    (entry) =>
      !entry.permission || hasPermission(me.permissions, entry.permission),
  );
  const denied = NAV.filter((entry) => !pages.includes(entry));

  if (pages.length === 0) {
    return (
      <div className="center muted">
        This account has no console pages. Ask an administrator for access.
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">HR Console</div>
        <nav className="nav">
          {pages.map(({ path, label }) => (
            <NavLink
              key={path}
              to={`/${path}`}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted small">{name}</span>
          <button className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="main-inner">
          <Routes>
            {pages.map(({ path, page: Page }) => (
              <Route key={path} path={path} element={<Page token={token} />} />
            ))}
            {/* A link to a real page this account cannot open explains itself,
                rather than looking like a broken console. */}
            {denied.map(({ path, label }) => (
              <Route
                key={path}
                path={path}
                element={<NoAccess label={label} />}
              />
            ))}
            <Route
              path="*"
              element={<Navigate to={`/${pages[0].path}`} replace />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function NoAccess({ label }: { label: string }) {
  return (
    <div className="card">
      <h2>{label}</h2>
      <p className="muted">
        Your account does not have access to this page. Ask an administrator if
        you need it.
      </p>
    </div>
  );
}
