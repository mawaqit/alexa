import { useEffect, useState } from "react";
import {
  api,
  bootstrapSessionFromUrl,
  hasPendingAlexaLink,
  type SessionResponse,
} from "./api/client";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";

// Two views, switched on auth state — not enough surface here yet to
// justify pulling in a router.
export function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    // Must run before getSession(): a freshly-completed login arrives with
    // the token in the URL fragment, not yet in sessionStorage — see
    // client.ts's bootstrapSessionFromUrl.
    bootstrapSessionFromUrl();
    api
      .getSession()
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  if (session === null) {
    return (
      <div className="page-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  return session.authenticated ? (
    <Dashboard
      linking={hasPendingAlexaLink()}
      onLoggedOut={() => setSession({ authenticated: false })}
    />
  ) : (
    <Landing />
  );
}
