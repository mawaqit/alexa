/**
 * Keys whose values are credentials in a Smart Home message: `grant.code` is a
 * live OAuth authorization code, and every `token` (`grantee`, `scope`,
 * `endpoint.scope`) is a bearer token. Written to CloudWatch, they would
 * outlive the request and be readable by anyone with log access.
 */
const SECRET_KEYS = new Set(["code", "token"]);

const REDACTED = "[REDACTED]";

/**
 * Returns a JSON-safe copy of `value` with every credential replaced, so a
 * whole directive or response can be logged without leaking one.
 *
 * Only string values are masked: the keys are generic enough that a
 * non-string `code` is not a credential, and masking it would hide a real bug.
 */
export function redact(value: unknown): unknown {
  // Widened, not asserted: `undefined`, a function, or a symbol serialises to
  // nothing at all, which the lib typing of JSON.stringify does not admit.
  const json: string | undefined = JSON.stringify(
    value,
    (key, field: unknown) =>
      SECRET_KEYS.has(key) && typeof field === "string" ? REDACTED : field,
  );
  return json === undefined ? undefined : JSON.parse(json);
}
