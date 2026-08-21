/**
 * The skill's Account Linking "Web Authorization URI" points here instead
 * of straight at Amazon (see the plan: "passthrough, not a custom OAuth
 * provider"). This inserts an LWA login + the existing website config
 * wizard before bouncing the browser back through Amazon's *real* authorize
 * endpoint to complete the standard handshake — Access Token URI stays
 * Amazon's own, so authHandler.js/worker.js/alexaEventSender.js need no
 * changes and keep getting genuine Amazon-issued tokens.
 *
 * The LWA login here uses webClientId/webClientSecret, not
 * process.env.clientId/clientSecret (the pair authHandler.js uses for the
 * skill's own token exchange) — confirmed via the LWA Security Profile
 * console that webClientId is the real account-linking client (it already
 * has Alexa's own redirect URLs registered on it), independent of whatever
 * /alexa/clientId happens to hold in SSM.
 *
 * Alexa's own redirect_uri/state/scope travel through the whole detour
 * packed into a signed token — as the `state` param sent to Amazon (which
 * echoes it back verbatim), then as the `link` fragment/query param —
 * rather than a cookie. A cookie-based version of this broke specifically
 * inside Alexa's own in-app browser during account linking (confirmed by
 * hand), even though the identical mechanics work fine for this file's
 * plain /auth/start+/auth/callback login in a normal desktop browser.
 */
jest.mock("axios");

const axios = require("axios");
const webAlexaLinkHandler = require("../handlers/webAlexaLinkHandler.js");
const webSessionHandler = require("../handlers/webSessionHandler.js");

const ALEXA_REDIRECT_URI = "https://pitangui.amazon.com/api/skill/link/EXAMPLE";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.webClientId = "test-web-client-id";
  process.env.webClientSecret = "test-web-client-secret";
  process.env.webSessionSecret = "test-session-secret";
  process.env.WEB_ORIGIN = "http://localhost:5173";
  process.env.WEB_REDIRECT_URI =
    "https://example.lambda-url.eu-west-3.on.aws/auth/callback";
});

describe("handleOAuthAuthorize", () => {
  const validQuery = {
    client_id: "test-web-client-id",
    redirect_uri: ALEXA_REDIRECT_URI,
    state: "alexa-csrf-state",
    response_type: "code",
    scope: "profile",
  };

  it("returns 400 for a response_type other than code", async () => {
    const response = await webAlexaLinkHandler.handleOAuthAuthorize({
      queryStringParameters: { ...validQuery, response_type: "token" },
    });

    expect(response.statusCode).toBe(400);
  });

  it.each(["redirect_uri", "state"])(
    "returns 400 when %s is missing",
    async (field) => {
      const query = { ...validQuery };
      delete query[field];

      const response = await webAlexaLinkHandler.handleOAuthAuthorize({
        queryStringParameters: query,
      });

      expect(response.statusCode).toBe(400);
    },
  );

  it("returns 400 when client_id doesn't match the account-linking client — never stages a link for an unrecognized caller", async () => {
    const response = await webAlexaLinkHandler.handleOAuthAuthorize({
      queryStringParameters: { ...validQuery, client_id: "someone-else" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for a redirect_uri that isn't a known Alexa host — the check that keeps this from being an open redirect", async () => {
    const response = await webAlexaLinkHandler.handleOAuthAuthorize({
      queryStringParameters: {
        ...validQuery,
        redirect_uri: "https://evil.example.com/steal",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("redirects to Amazon's authorize endpoint using webClientId and this route's own lwa-callback, not the website's own /auth/callback", async () => {
    const response = await webAlexaLinkHandler.handleOAuthAuthorize({
      queryStringParameters: validQuery,
    });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.Location);
    expect(location.origin + location.pathname).toBe(
      "https://www.amazon.com/ap/oa",
    );
    expect(location.searchParams.get("client_id")).toBe("test-web-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://example.lambda-url.eu-west-3.on.aws/oauth/lwa-callback",
    );
    // Not the full "profile" scope — this LWA Security Profile rejects it
    // outright ("unknown scope", confirmed by hand); profile:user_id is the
    // minimal scope that's actually granted, and all we need anyway.
    expect(location.searchParams.get("scope")).toBe("profile:user_id");
  });

  it("packs Alexa's redirect_uri/state/scope into the `state` param sent to Amazon, not a cookie", async () => {
    const response = await webAlexaLinkHandler.handleOAuthAuthorize({
      queryStringParameters: validQuery,
    });

    expect(response.cookies).toBeUndefined();
    const location = new URL(response.headers.Location);
    const linkToken = location.searchParams.get("state");
    const payload = webSessionHandler.verifySessionToken(linkToken, {
      secret: "test-session-secret",
    });
    expect(payload.redirectUri).toBe(ALEXA_REDIRECT_URI);
    expect(payload.state).toBe("alexa-csrf-state");
    expect(payload.scope).toBe("profile");
  });
});

describe("handleOAuthLwaCallback", () => {
  const linkToken = (payload) =>
    webSessionHandler.signSessionToken(payload, {
      secret: "test-session-secret",
    });
  const eventWithState = (overrides = {}) => ({
    queryStringParameters: {
      code: "lwa-code",
      state: linkToken({
        redirectUri: ALEXA_REDIRECT_URI,
        state: "alexa-csrf-state",
        scope: "profile",
      }),
    },
    ...overrides,
  });

  it("rejects when the state param isn't a validly-signed token — the CSRF check this callback exists for", async () => {
    const response = await webAlexaLinkHandler.handleOAuthLwaCallback(
      eventWithState({
        queryStringParameters: { code: "lwa-code", state: "forged" },
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(axios.request).not.toHaveBeenCalled();
  });

  it("rejects when there is no code at all", async () => {
    const event = eventWithState();
    delete event.queryStringParameters.code;

    const response = await webAlexaLinkHandler.handleOAuthLwaCallback(event);

    expect(response.statusCode).toBe(400);
  });

  it("exchanges the code using webClientId/webClientSecret and this route's own redirect_uri, then redirects with a session token in the URL fragment", async () => {
    axios.request
      .mockResolvedValueOnce({ data: { access_token: "lwa-access-token" } })
      .mockResolvedValueOnce({ data: { user_id: "amzn1.account.EXAMPLE" } });

    const response =
      await webAlexaLinkHandler.handleOAuthLwaCallback(eventWithState());

    const tokenCall = axios.request.mock.calls[0][0];
    expect(tokenCall.url).toBe("https://api.amazon.com/auth/o2/token");
    expect(tokenCall.data.get("client_id")).toBe("test-web-client-id");
    expect(tokenCall.data.get("client_secret")).toBe("test-web-client-secret");
    expect(tokenCall.data.get("redirect_uri")).toBe(
      "https://example.lambda-url.eu-west-3.on.aws/oauth/lwa-callback",
    );

    const profileCall = axios.request.mock.calls[1][0];
    expect(profileCall.headers.Authorization).toBe("Bearer lwa-access-token");

    expect(response.statusCode).toBe(302);
    // Both tokens travel via the fragment, not a cookie — see the file's
    // top comment for why.
    expect(response.cookies).toBeUndefined();
    const location = new URL(response.headers.Location);
    expect(location.origin + location.pathname).toBe("http://localhost:5173/");
    const hashParams = new URLSearchParams(location.hash.slice(1));

    const sessionPayload = webSessionHandler.verifySessionToken(
      hashParams.get("session"),
      { secret: "test-session-secret" },
    );
    expect(sessionPayload.sub).toBe("amzn1.account.EXAMPLE");

    // The link token is forwarded as-is (it's the same `state` Amazon
    // echoed back) — still valid and carrying Alexa's original params.
    const linkPayload = webSessionHandler.verifySessionToken(
      hashParams.get("link"),
      { secret: "test-session-secret" },
    );
    expect(linkPayload.redirectUri).toBe(ALEXA_REDIRECT_URI);
    expect(linkPayload.state).toBe("alexa-csrf-state");
  });

  it("returns 502 without redirecting anywhere when the LWA token exchange fails", async () => {
    axios.request.mockRejectedValue(new Error("Amazon said no"));

    const response =
      await webAlexaLinkHandler.handleOAuthLwaCallback(eventWithState());

    expect(response.statusCode).toBe(502);
    expect(response.headers.Location).toBeUndefined();
  });
});

describe("handleOAuthCompleteLinking", () => {
  const sessionToken = () =>
    webSessionHandler.signSessionToken(
      { sub: "amzn1.account.EXAMPLE" },
      { secret: "test-session-secret" },
    );
  const linkToken = (payload) =>
    webSessionHandler.signSessionToken(payload, {
      secret: "test-session-secret",
    });

  it("returns 400 when there is no session query param — reaching this without one means the flow didn't go through handleOAuthLwaCallback first", async () => {
    const response = await webAlexaLinkHandler.handleOAuthCompleteLinking({
      queryStringParameters: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for a tampered/expired session token rather than trusting it", async () => {
    const response = await webAlexaLinkHandler.handleOAuthCompleteLinking({
      queryStringParameters: { session: "not-a-real-token" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when there's no link token — nothing to hand back to Alexa", async () => {
    const response = await webAlexaLinkHandler.handleOAuthCompleteLinking({
      queryStringParameters: { session: sessionToken() },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for a tampered/expired link token rather than trusting it", async () => {
    const response = await webAlexaLinkHandler.handleOAuthCompleteLinking({
      queryStringParameters: {
        session: sessionToken(),
        link: "not-a-real-token",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("redirects to Amazon's real authorize endpoint with webClientId and Alexa's original redirect_uri/state/scope — hop 2 of the passthrough", async () => {
    const response = await webAlexaLinkHandler.handleOAuthCompleteLinking({
      queryStringParameters: {
        session: sessionToken(),
        link: linkToken({
          redirectUri: ALEXA_REDIRECT_URI,
          state: "alexa-csrf-state",
          scope: "profile",
        }),
      },
    });

    expect(response.statusCode).toBe(302);
    expect(response.cookies).toBeUndefined();
    const location = new URL(response.headers.Location);
    expect(location.origin + location.pathname).toBe(
      "https://www.amazon.com/ap/oa",
    );
    expect(location.searchParams.get("client_id")).toBe("test-web-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(ALEXA_REDIRECT_URI);
    expect(location.searchParams.get("state")).toBe("alexa-csrf-state");
    expect(location.searchParams.get("response_type")).toBe("code");
  });
});
