import { useEffect, useState } from "react";
import { api, type SessionResponse } from "./api/client";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";

// Two views, switched on auth state — not enough surface here yet to
// justify pulling in a router.
export function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    api
      .getSession()
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  if (session === null) {
    return (
      <div className="page-loading" role="status">
        Loading…
      </div>
    );
  }

  return session.authenticated ? (
    <Dashboard onLoggedOut={() => setSession({ authenticated: false })} />
  ) : (
    <Landing />
  );
}
