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
});
