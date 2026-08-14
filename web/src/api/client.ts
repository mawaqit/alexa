// Talks to lambda/webApi.js. Every call sends the session cookie
// (`credentials: "include"`) — there is no token stored in the browser to
// attach manually, by design (see webAuthHandler.js's session model).
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
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
  async getSession(): Promise<SessionResponse> {
    const response = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
    return (await response.json()) as SessionResponse;
  },

  logout: () => request<void>("/auth/logout", { method: "POST" }),

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
