/**
 * The website session is a hand-rolled HS256 JWT (no external dependency —
 * see webSessionHandler.js for why). These tests exist to prove the signing
 * and verification actually agree with each other, and that a tampered or
 * expired token is rejected rather than silently trusted.
 */
const webSessionHandler = require("../handlers/webSessionHandler.js");

const SECRET = "test-session-secret";

describe("signSessionToken / verifySessionToken", () => {
  it("round-trips a payload signed and verified with the same secret", () => {
    const token = webSessionHandler.signSessionToken(
      { sub: "amzn1.account.EXAMPLE" },
      { secret: SECRET },
    );

    const payload = webSessionHandler.verifySessionToken(token, {
      secret: SECRET,
    });

    expect(payload.sub).toBe("amzn1.account.EXAMPLE");
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects a token signed with a different secret", () => {
    const token = webSessionHandler.signSessionToken(
      { sub: "user-1" },
      { secret: SECRET },
    );

    // Simulates a forged/tampered token, or a session signed before a secret
    // rotation — both must come back as "not logged in", not a crash.
    const payload = webSessionHandler.verifySessionToken(token, {
      secret: "wrong-secret",
    });

    expect(payload).toBeNull();
  });

  it("rejects a token whose payload segment was altered", () => {
    const token = webSessionHandler.signSessionToken(
      { sub: "user-1" },
      { secret: SECRET },
    );
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "someone-else" }),
    ).toString("base64url");
    const forgedToken = `${header}.${forgedPayload}.${signature}`;

    expect(
      webSessionHandler.verifySessionToken(forgedToken, { secret: SECRET }),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = webSessionHandler.signSessionToken(
      { sub: "user-1" },
      { secret: SECRET, expiresInSeconds: -1 },
    );

    expect(
      webSessionHandler.verifySessionToken(token, { secret: SECRET }),
    ).toBeNull();
  });

  it("rejects a malformed token instead of throwing", () => {
    expect(
      webSessionHandler.verifySessionToken("not-a-jwt", { secret: SECRET }),
    ).toBeNull();
    expect(
      webSessionHandler.verifySessionToken("", { secret: SECRET }),
    ).toBeNull();
    expect(
      webSessionHandler.verifySessionToken(undefined, { secret: SECRET }),
    ).toBeNull();
  });

  it("throws when signing without a configured secret — a misconfigured deploy should fail loudly here, not hand out an unsigned cookie", () => {
    expect(() =>
      webSessionHandler.signSessionToken(
        { sub: "user-1" },
        { secret: undefined },
      ),
    ).toThrow(/webSessionSecret/);
  });
});

// Neither the session nor the Alexa-linking handoff data travel as cookies
// anymore (see the comment at the top of webSessionHandler.js) — oauth_state
// is the one exception still worth a cookie. buildStateCookie exercises the
// shared buildCookie() every cookie in this file goes through.
describe("cookie builders", () => {
  it("marks the cookie HttpOnly, Secure, Partitioned and SameSite=None when deployed — the frontend and backend live on different domains there, and Lax cookies are excluded from the SPA's own cross-site fetch() calls", () => {
    const cookie = webSessionHandler.buildStateCookie("nonce-value", {
      secure: true,
    });

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
    // CHIPS — without this, browsers that block unpartitioned third-party
    // cookies store the cookie (visible in DevTools) but silently never
    // send it, which looks identical to a missing cookie.
    expect(cookie).toContain("Partitioned");
    expect(cookie).toContain(
      `${webSessionHandler.STATE_COOKIE_NAME}=nonce-value`,
    );
  });

  it("uses SameSite=Lax and omits Secure/Partitioned for local http:// dev — frontend and backend are same-site there (SameSite ignores port), Secure would be silently dropped over plain http, and Partitioned requires Secure", () => {
    const cookie = webSessionHandler.buildStateCookie("nonce-value", {
      secure: false,
    });

    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Partitioned");
  });

  it("clears the state cookie with Max-Age=0", () => {
    const cookie = webSessionHandler.buildClearStateCookie({ secure: true });

    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain(`${webSessionHandler.STATE_COOKIE_NAME}=`);
  });
});

describe("getBearerToken", () => {
  it("extracts the token from a lowercase Authorization header — how a real Lambda Function URL event delivers it", () => {
    const event = { headers: { authorization: "Bearer abc.def.ghi" } };

    expect(webSessionHandler.getBearerToken(event)).toBe("abc.def.ghi");
  });

  it("also accepts a capitalized header — for events built by hand (tests, local tooling)", () => {
    const event = { headers: { Authorization: "Bearer abc.def.ghi" } };

    expect(webSessionHandler.getBearerToken(event)).toBe("abc.def.ghi");
  });

  it("returns null when there is no Authorization header at all", () => {
    expect(webSessionHandler.getBearerToken({ headers: {} })).toBeNull();
    expect(webSessionHandler.getBearerToken({})).toBeNull();
  });

  it("returns null for a header that isn't a Bearer token, instead of returning garbage", () => {
    const event = { headers: { authorization: "Basic dXNlcjpwYXNz" } };

    expect(webSessionHandler.getBearerToken(event)).toBeNull();
  });
});

describe("parseCookies", () => {
  it("reads the pre-split cookies array a Lambda Function URL (payload v2) provides", () => {
    const event = {
      cookies: ["oauth_state=abc123", "mawaqit_web_session=xyz"],
    };

    expect(webSessionHandler.parseCookies(event)).toEqual({
      oauth_state: "abc123",
      mawaqit_web_session: "xyz",
    });
  });

  it("falls back to a raw Cookie header when event.cookies is absent", () => {
    const event = {
      headers: { cookie: "oauth_state=abc123; mawaqit_web_session=xyz" },
    };

    expect(webSessionHandler.parseCookies(event)).toEqual({
      oauth_state: "abc123",
      mawaqit_web_session: "xyz",
    });
  });

  it("returns an empty object when there are no cookies at all", () => {
    expect(webSessionHandler.parseCookies({})).toEqual({});
  });
});
