// Talks to lambda/webApi.js. The session travels as a bearer token, not a
// cookie: the frontend and backend live on different domains (this dev
// tunnel today, eventually CloudFront vs. the Function URL), and no
// combination of SameSite/Secure/Partitioned gets a cookie reliably sent on
// this file's own cross-site fetch() calls — confirmed by hand. See the
// comment at the top of lambda/handlers/webSessionHandler.js for the full
// story.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

// sessionStorage, not localStorage: tokens are scoped to this tab/session on
// purpose — logging in doesn't need to silently carry over to a different
// tab, and it naturally clears itself when the tab closes.
const SESSION_TOKEN_KEY = "mawaqit_session_token";
// Set only when this browser arrived via the Alexa app's "Link Account"
// flow and hasn't handed back to Alexa yet — see webAlexaLinkHandler.js's
// handleOAuthAuthorize/handleOAuthLwaCallback. Its presence is the one
// signal the UI needs to show "Continue to Alexa" instead of the ordinary
// dashboard; the token itself is opaque here (this file can't verify its
// signature, only the backend can) — it's just being carried until
// getCompleteLinkingUrl needs it.
const ALEXA_LINK_TOKEN_KEY = "mawaqit_alexa_link_token";

function getStoredToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

function clearStoredToken(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(ALEXA_LINK_TOKEN_KEY);
}

// Whether there's a pending Alexa account-linking request waiting on this
// browser. Gates whether Dashboard/SetupWizard show "Continue to Alexa".
export function hasPendingAlexaLink(): boolean {
  return Boolean(sessionStorage.getItem(ALEXA_LINK_TOKEN_KEY));
}

// Called once, at app startup (see App.tsx): webAuthHandler.js/
// webAlexaLinkHandler.js deliver a freshly-issued session token — and, only
// on the Alexa-linking path, a second token carrying Alexa's own
// redirect_uri/state/scope — as a URL *fragment* (`#session=...&link=...`)
// on the redirect back into the SPA. Fragments never reach any server,
// unlike a query param. This picks both up, stashes them in sessionStorage,
// and strips the fragment from the address bar so it doesn't linger in
// browser history.
export function bootstrapSessionFromUrl(): void {
  const hash = window.location.hash;
  if (!hash.startsWith("#")) return;
  const params = new URLSearchParams(hash.slice(1));
  const sessionToken = params.get("session");
  if (!sessionToken) return;

  sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  const linkToken = params.get("link");
  if (linkToken) {
    sessionStorage.setItem(ALEXA_LINK_TOKEN_KEY, linkToken);
  }

  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

// A real navigation target (not fetched via `request` below) — it ends on
// Amazon's/Alexa's own domain, completing the account-linking handshake
// webAlexaLinkHandler.js started. A plain `<a href>` can't carry an
// Authorization header, so both tokens are embedded as query params instead
// (webAlexaLinkHandler.handleOAuthCompleteLinking reads them from there) —
// see the comment on that function for why this route is the one exception
// to the bearer-header rule. Returns null when either token is missing
// (caller shouldn't render the link at all in that case).
export function getCompleteLinkingUrl(): string | null {
  const session = getStoredToken();
  const link = sessionStorage.getItem(ALEXA_LINK_TOKEN_KEY);
  if (!session || !link) return null;
  const params = new URLSearchParams({ session, link });
  return `${API_BASE}/oauth/complete-linking?${params.toString()}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Response wasn't JSON — fall back to the status text above.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface SessionResponse {
  authenticated: boolean;
  userId?: string;
}

export interface Mosque {
  uuid: string;
  primaryText: string;
  proximity?: number | null;
  localisation?: string | null;
  jumua?: string | null;
  jumua2?: string | null;
  jumua3?: string | null;
  image?: string | null;
}

export interface RoutinePrayer {
  name: string;
  canonicalName: string;
  time: string;
  namePhoneme?: string;
}

// Just the name — the mp3 URLs behind each reciter never need to reach the
// browser, only which one is currently picked (see webConfigHandler.js's
// handleGetReciters/handleGetConfig).
export interface Reciter {
  primaryText: string;
}

export type LinkedState = "alexa" | "web-only" | "none";

export interface MeConfigResponse {
  linked: LinkedState;
  mosque: Mosque | null;
  // "alexa"-linked configs carry full routine objects; a "web-only" pending
  // config (not applied yet) carries just the canonical names that were
  // saved — see webConfigHandler.js's handleGetConfig.
  routinePrayers: RoutinePrayer[] | string[];
  favouriteAdhaan: string | null;
  pending?: boolean;
  deviceLinked?: boolean;
}

export interface PrayerTime {
  canonicalName: string;
  time: string;
}

export interface SaveResult {
  saved: boolean;
  applied: boolean;
  reason?: string;
}

export const api = {
  // Both the 200 and 401 responses from /auth/session are valid JSON with an
  // `authenticated` field — no need to special-case the status code here.
  // No token at all (never logged in) is reported the same way as a
  // rejected one — just ask the server rather than special-casing it here.
  async getSession(): Promise<SessionResponse> {
    const response = await fetch(`${API_BASE}/auth/session`, {
      headers: authHeaders(),
    });
    return (await response.json()) as SessionResponse;
  },

  logout: () =>
    request<void>("/auth/logout", { method: "POST" }).finally(clearStoredToken),

  getConfig: () => request<MeConfigResponse>("/me/config"),

  searchMosques: (params: { lat?: string; lon?: string; word?: string }) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    return request<Mosque[]>(`/mosques/search?${query.toString()}`);
  },

  getMosqueTimes: (uuid: string, timezone: string) =>
    request<{ prayerTimes: PrayerTime[] }>(
      `/mosques/${encodeURIComponent(uuid)}/times?timezone=${encodeURIComponent(timezone)}`,
    ),

  saveMosque: (mosque: Mosque & { timezone: string }) =>
    request<SaveResult>("/me/mosque", {
      method: "PUT",
      body: JSON.stringify(mosque),
    }),

  savePrayers: (prayers: string[], timezone: string) =>
    request<SaveResult>("/me/prayers", {
      method: "PUT",
      body: JSON.stringify({ prayers, timezone }),
    }),

  getReciters: () => request<Reciter[]>("/me/reciters"),

  saveReciter: (primaryText: string) =>
    request<SaveResult>("/me/reciter", {
      method: "PUT",
      body: JSON.stringify({ primaryText }),
    }),
};
