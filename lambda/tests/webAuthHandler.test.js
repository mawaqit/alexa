/**
 * Login With Amazon for the website is a separate OAuth client from the
 * skill's own account-linking flow, and unlike the skill's flow it needs an
 * explicit redirect_uri and a CSRF-safe state check (there's no Alexa app
 * managing the redirect for it). These tests cover the parts most likely to
 * silently break: the state check that prevents a forged callback, the
 * client secret never leaking into a redirect URL, and the session token
 * only ever carrying user_id.
 */
jest.mock("axios");

const axios = require("axios");
const webAuthHandler = require("../handlers/webAuthHandler.js");
const webSessionHandler = require("../handlers/webSessionHandler.js");

beforeEach(() => {
  jest.clearAllMocks();
  process.env.webClientId = "test-web-client-id";
  process.env.webClientSecret = "test-web-client-secret";
  process.env.webSessionSecret = "test-session-secret";
  process.env.WEB_REDIRECT_URI = "http://localhost:3000/auth/callback";
  process.env.WEB_ORIGIN = "http://localhost:5173";
});

describe("handleAuthStart", () => {
  it("redirects to Amazon's authorize endpoint with the website's own client id and an explicit redirect_uri", async () => {
    const response = await webAuthHandler.handleAuthStart();

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.Location);
    expect(location.origin + location.pathname).toBe(
      "https://www.amazon.com/ap/oa",
    );
    expect(location.searchParams.get("client_id")).toBe("test-web-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/auth/callback",
    );
    expect(location.searchParams.get("scope")).toBe("profile");
    expect(location.searchParams.get("state")).toEqual(expect.any(String));
  });

  it("sets a state cookie matching the state query param, so the callback can verify it later", async () => {
    const response = await webAuthHandler.handleAuthStart();

    const location = new URL(response.headers.Location);
    const state = location.searchParams.get("state");
    expect(response.cookies[0]).toContain(`oauth_state=${state}`);
  });

  it("returns 503 instead of building a broken redirect when the website's LWA credentials haven't been provisioned in SSM yet", async () => {
    delete process.env.webClientId;

    const response = await webAuthHandler.handleAuthStart();

    expect(response.statusCode).toBe(503);
  });
});

describe("handleAuthCallback", () => {
  const validState = "nonce-abc";
  const eventWithState = (overrides = {}) => ({
    queryStringParameters: { code: "auth-code", state: validState },
    cookies: [`oauth_state=${validState}`],
    ...overrides,
  });

  it("rejects when the state query param doesn't match the state cookie — the CSRF check this callback exists for", async () => {
    const response = await webAuthHandler.handleAuthCallback(
      eventWithState({
        queryStringParameters: { code: "auth-code", state: "forged" },
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(axios.request).not.toHaveBeenCalled();
  });

  it("rejects when there is no state cookie at all", async () => {
    const response = await webAuthHandler.handleAuthCallback(
      eventWithState({ cookies: [] }),
    );

    expect(response.statusCode).toBe(400);
  });

  it("exchanges the code with the redirect_uri included, fetches the profile, and redirects with a session token carrying only user_id in the URL fragment", async () => {
    axios.request
      .mockResolvedValueOnce({ data: { access_token: "lwa-access-token" } })
      .mockResolvedValueOnce({
        data: {
          user_id: "amzn1.account.EXAMPLE",
          name: "Test User",
          email: "test@example.com",
        },
      });

    const response = await webAuthHandler.handleAuthCallback(eventWithState());

    const tokenCall = axios.request.mock.calls[0][0];
    expect(tokenCall.url).toBe("https://api.amazon.com/auth/o2/token");
    expect(tokenCall.data.get("redirect_uri")).toBe(
      "http://localhost:3000/auth/callback",
    );
    expect(tokenCall.data.get("client_id")).toBe("test-web-client-id");
    expect(tokenCall.data.get("client_secret")).toBe("test-web-client-secret");

    expect(response.statusCode).toBe(302);
    // A fragment, not a cookie: no combination of SameSite/Secure/
    // Partitioned reliably gets a cookie sent on the SPA's own cross-site
    // fetch() calls once frontend and backend are different domains —
    // confirmed by hand. See webSessionHandler.js's top comment.
    const location = new URL(response.headers.Location);
    expect(location.origin + location.pathname).toBe("http://localhost:5173/");
    expect(location.hash.startsWith("#session=")).toBe(true);

    const token = location.hash.slice("#session=".length);
    const payload = webSessionHandler.verifySessionToken(token, {
      secret: "test-session-secret",
    });
    expect(payload.sub).toBe("amzn1.account.EXAMPLE");
    // name/email must never end up in the session — matches every other LWA
    // flow in this repo, which never persists them either.
    expect(payload.name).toBeUndefined();
    expect(payload.email).toBeUndefined();
  });

  it("returns 502 without redirecting anywhere when the LWA token exchange fails", async () => {
    axios.request.mockRejectedValue(new Error("Amazon said no"));

    const response = await webAuthHandler.handleAuthCallback(eventWithState());

    expect(response.statusCode).toBe(502);
    expect(response.headers.Location).toBeUndefined();
  });
});

describe("handleAuthLogout", () => {
  it("returns 204 — the session is a client-held bearer token, nothing to clear server-side", async () => {
    const response = await webAuthHandler.handleAuthLogout();

    expect(response.statusCode).toBe(204);
  });
});

describe("handleAuthSession", () => {
  it("returns 401 when there is no Authorization header", async () => {
    const response = await webAuthHandler.handleAuthSession({});

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ authenticated: false });
  });

  it("returns the LWA user id from a valid bearer token", async () => {
    const token = webSessionHandler.signSessionToken(
      { sub: "amzn1.account.EXAMPLE" },
      { secret: "test-session-secret" },
    );
    const event = { headers: { authorization: `Bearer ${token}` } };

    const response = await webAuthHandler.handleAuthSession(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      authenticated: true,
      userId: "amzn1.account.EXAMPLE",
    });
  });
});
