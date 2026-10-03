/**
 * Keys whose values are credentials, in normalized form (see
 * {@link normalizeKey}). `code` and `token` are the Smart Home ones:
 * `grant.code` is a live OAuth authorization code, and every `token`
 * (`grantee`, `scope`, `endpoint.scope`) is a bearer token. The rest never
 * appear in a directive today; they are masked so that an unexpected payload,
 * or a header logged by mistake, cannot carry one through. Written to
 * CloudWatch, any of them would outlive the request and be readable by anyone
 * with log access.
 */
const SECRET_KEYS = new Set([
  "code",
  "token",
  "authorization",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "password",
]);

/**
 * An HTTP credential (`Bearer <token>`, `Basic <base64>`), masked whatever key
 * holds it. Requires whitespace and a value after the scheme, so the Smart
 * Home type label `"BearerToken"` is not a match.
 */
const CREDENTIAL_VALUE = /^\s*(?:bearer|basic)\s+\S/i;

const REDACTED = "[REDACTED]";

/** `Access-Token`, `access_token` and `accessToken` all become `accesstoken`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

/**
 * Returns a JSON copy of `value` with credentials replaced by "[REDACTED]" at
 * any depth: string values under a credential key (matched case-insensitively,
 * ignoring `-` and `_`), and any string value that is a Bearer or Basic
 * credential.
 *
 * Only string values are masked: the keys are generic enough that a
 * non-string `code` is not a credential, and masking it would hide a real bug.
 * Returns undefined when JSON.stringify produces no JSON value. Other values
 * follow JSON serialization rules; serialization errors propagate, including
 * TypeError for circular references or BigInt values without a JSON conversion.
 */
export function redact(value: unknown): unknown {
  // Widened, not asserted: `undefined`, a function, or a symbol serialises to
  // nothing at all, which the lib typing of JSON.stringify does not admit.
  const json: string | undefined = JSON.stringify(
    value,
    (key, field: unknown) =>
      typeof field === "string" &&
      (SECRET_KEYS.has(normalizeKey(key)) || CREDENTIAL_VALUE.test(field))
        ? REDACTED
        : field,
  );
  return json === undefined ? undefined : JSON.parse(json);
}
