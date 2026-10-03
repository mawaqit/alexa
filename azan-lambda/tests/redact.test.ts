/**
 * The dispatcher logs every directive and response in full, and an AcceptGrant
 * carries a live OAuth code plus bearer tokens. `redact` is the only thing
 * standing between those credentials and CloudWatch, so a key it misses is a
 * credential leaked into the logs of every account link.
 */

import { redact } from "../src/logging/redact";

describe("redact", () => {
  it("masks the grant code and every token in an AcceptGrant", () => {
    const acceptGrant = {
      directive: {
        header: { namespace: "Alexa.Authorization", name: "AcceptGrant" },
        payload: {
          grant: { type: "OAuth2.AuthorizationCode", code: "live-code" },
          grantee: { type: "BearerToken", token: "bearer" },
        },
      },
    };

    expect(redact(acceptGrant)).toEqual({
      directive: {
        header: { namespace: "Alexa.Authorization", name: "AcceptGrant" },
        payload: {
          grant: { type: "OAuth2.AuthorizationCode", code: "[REDACTED]" },
          grantee: { type: "BearerToken", token: "[REDACTED]" },
        },
      },
    });
  });

  it("masks the scope token of a Discover", () => {
    const discover = {
      directive: { payload: { scope: { type: "BearerToken", token: "t" } } },
    };

    expect(JSON.stringify(redact(discover))).not.toContain('"t"');
  });

  it("leaves the original object untouched", () => {
    // The response object is returned to Alexa after being logged; masking it
    // in place would send "[REDACTED]" to Amazon instead of the real value.
    const original = { scope: { token: "keep-me" } };
    redact(original);
    expect(original.scope.token).toBe("keep-me");
  });

  it("keeps a non-string code, which is not a credential", () => {
    expect(redact({ code: 404 })).toEqual({ code: 404 });
  });

  it("returns undefined for a value that has no JSON form", () => {
    expect(redact(undefined)).toBeUndefined();
  });

  it("masks an Authorization header", () => {
    // The dispatcher logs the raw event before validating it, so whatever
    // arrives is logged as-is.
    expect(redact({ Authorization: "Bearer secret" })).toEqual({
      Authorization: "[REDACTED]",
    });
  });

  it("masks credential keys whatever their case or separator", () => {
    const logged = JSON.stringify(
      redact({
        Token: "t",
        access_token: "a",
        "Refresh-Token": "r",
        clientSecret: "s",
        PASSWORD: "p",
      }),
    );

    for (const secret of ['"t"', '"a"', '"r"', '"s"', '"p"']) {
      expect(logged).not.toContain(secret);
    }
  });

  it("masks a Bearer or Basic credential under any key", () => {
    expect(
      redact({
        headers: { "X-Forwarded-Auth": "Bearer abc" },
        note: "basic dXNlcjpwYXNz",
      }),
    ).toEqual({
      headers: { "X-Forwarded-Auth": "[REDACTED]" },
      note: "[REDACTED]",
    });
  });

  it("keeps the BearerToken type label, which is not a credential", () => {
    // Every AcceptGrant and Discover names its token type this way; masking
    // it would hide which kind of token Amazon sent.
    expect(redact({ type: "BearerToken" })).toEqual({ type: "BearerToken" });
  });
});
