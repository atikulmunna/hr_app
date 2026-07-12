import { useAuth } from 'react-oidc-context';
import { Approvals } from './pages/Approvals';

export default function App() {
  const auth = useAuth();

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
        <div className="spacer" />
        <span className="muted">{name}</span>
        <button className="btn" onClick={() => void auth.removeUser()}>
          Sign out
        </button>
      </header>
      <main className="content">
        <Approvals token={auth.user!.access_token} />
      </main>
    </div>
  );
}
