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

describe("cookie builders", () => {
  it("marks the session cookie HttpOnly and SameSite=Lax so it can't be read or leaked by third-party requests", () => {
    const cookie = webSessionHandler.buildSessionCookie("token-value", {
      secure: true,
    });

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(
      `${webSessionHandler.SESSION_COOKIE_NAME}=token-value`,
    );
  });

  it("omits Secure for local http:// dev, where a Secure cookie would be silently dropped by the browser", () => {
    const cookie = webSessionHandler.buildSessionCookie("token-value", {
      secure: false,
    });

    expect(cookie).not.toContain("Secure");
  });

  it("clears the session cookie with Max-Age=0", () => {
    const cookie = webSessionHandler.buildClearSessionCookie({ secure: true });

    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain(`${webSessionHandler.SESSION_COOKIE_NAME}=`);
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
