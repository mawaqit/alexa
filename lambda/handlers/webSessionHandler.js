const crypto = require("crypto");

// The companion website's session carries exactly one claim (the LWA user
// id), so a full JWT library is more surface area than the problem needs —
// this is a minimal, dependency-free HS256 JWT (header.payload.signature,
// base64url, HMAC-SHA256) using only Node's built-in crypto module.
const SESSION_COOKIE_NAME = "mawaqit_web_session";
const STATE_COOKIE_NAME = "oauth_state";
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const STATE_TTL_SECONDS = 5 * 60; // long enough to complete the Amazon login redirect

function signSessionToken(
  payload,
  {
    secret = process.env.webSessionSecret,
    expiresInSeconds = SESSION_TTL_SECONDS,
  } = {},
) {
  if (!secret) {
    throw new Error(
      "webSessionSecret is not set — check the SSM bootstrap (awsSsmHandler)",
    );
  }
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const signature = signSegment(`${encodedHeader}.${encodedBody}`, secret);
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

// Never throws: an invalid/expired/tampered token is just "not logged in",
// not an error worth a 500.
function verifySessionToken(
  token,
  { secret = process.env.webSessionSecret } = {},
) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedBody, signature] = parts;

  const expectedSignature = signSegment(
    `${encodedHeader}.${encodedBody}`,
    secret,
  );
  if (!constantTimeEquals(signature, expectedSignature)) return null;

  let payload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedBody, "base64url").toString("utf8"),
    );
  } catch (error) {
    console.error(
      "[webSessionHandler] Malformed session payload:",
      error.message,
    );
    return null;
  }

  if (
    typeof payload.exp === "number" &&
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return null; // expired
  }
  return payload;
}

function generateStateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function buildSessionCookie(token, { secure = true } = {}) {
  return buildCookie(SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_TTL_SECONDS,
    secure,
  });
}

function buildClearSessionCookie({ secure = true } = {}) {
  return buildCookie(SESSION_COOKIE_NAME, "", { maxAge: 0, secure });
}

function buildStateCookie(nonce, { secure = true } = {}) {
  return buildCookie(STATE_COOKIE_NAME, nonce, {
    maxAge: STATE_TTL_SECONDS,
    secure,
  });
}

function buildClearStateCookie({ secure = true } = {}) {
  return buildCookie(STATE_COOKIE_NAME, "", { maxAge: 0, secure });
}

// A Lambda Function URL (payload format 2.0, same shape API Gateway HTTP
// API uses) hands cookies to Lambda as event.cookies, already split on
// "; " — but local tooling/manual testing may only supply a raw Cookie
// header, so fall back to parsing that too.
function parseCookies(event) {
  const rawCookies =
    event?.cookies ||
    (event?.headers?.cookie ? event.headers.cookie.split("; ") : []);
  return rawCookies.reduce((acc, pair) => {
    const eq = pair.indexOf("=");
    if (eq === -1) return acc;
    acc[pair.slice(0, eq).trim()] = decodeURIComponent(
      pair.slice(eq + 1).trim(),
    );
    return acc;
  }, {});
}

function buildCookie(name, value, { maxAge, secure }) {
  const attrs = [
    `${name}=${value}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

function signSegment(data, secret) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

function base64url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buffer.toString("base64url");
}

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
  generateStateNonce,
  buildSessionCookie,
  buildClearSessionCookie,
  buildStateCookie,
  buildClearStateCookie,
  parseCookies,
};
