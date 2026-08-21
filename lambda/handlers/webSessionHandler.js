const crypto = require("crypto");

// The companion website's session carries exactly one claim (the LWA user
// id), so a full JWT library is more surface area than the problem needs —
// this is a minimal, dependency-free HS256 JWT (header.payload.signature,
// base64url, HMAC-SHA256) using only Node's built-in crypto module.
//
// Neither the session nor the Alexa-linking handoff data (webAlexaLinkHandler.js)
// travel as cookies — both are bearer tokens carried via URL fragment/query
// param instead. Two different cookie-reliability problems forced this:
// (1) no combination of SameSite/Secure/Partitioned gets a cookie reliably
// sent on the SPA's own cross-site fetch() calls once frontend and backend
// are genuinely different domains (confirmed by hand); (2) even a same-origin
// cookie (set and read entirely by this backend during its own redirect
// chain, e.g. our domain → Amazon → our domain) isn't reliable when driven
// by Alexa's own in-app browser during account linking, even though the
// identical mechanics work fine for this file's plain /auth/start+
// /auth/callback login in a normal desktop browser (confirmed by hand).
// oauth_state below is the one exception still worth a cookie: it's only
// ever exercised through a normal desktop browser (a direct site visit),
// never through Alexa's embedded one.
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

// Reads the session token from `Authorization: Bearer <token>`. Lambda
// Function URL header keys arrive lowercased, but this also accepts the
// capitalized form for anything constructing an event by hand (tests, local
// tooling).
function getBearerToken(event) {
  const header = event?.headers?.authorization || event?.headers?.Authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
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
    // Lax works for local dev, where the frontend (localhost:5173) and
    // backend (localhost:3000) are genuinely same-site (SameSite only cares
    // about scheme + registrable domain, not port). Deployed, the frontend
    // (its own domain — a dev tunnel today, eventually CloudFront) and
    // backend (the Function URL's own domain) are cross-site, and Lax
    // cookies are excluded from cross-site fetch()/XHR — only sent on
    // top-level navigation — so the SPA's own /auth/session check would
    // never see the cookie it just got redirected here with, and the login
    // flow would loop forever. None requires Secure, which `secure` already
    // implies here (only true when deployed over https).
    `SameSite=${secure ? "None" : "Lax"}`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) {
    attrs.push("Secure");
    // CHIPS: browsers are increasingly blocking "unpartitioned" third-party
    // cookies outright — this cookie IS third-party from the browser's
    // perspective whenever deployed (frontend and backend are cross-site).
    // Partitioned is the standards-track exemption for exactly this shape
    // (cross-site frontend/API pair, no cross-site tracking involved) —
    // without it, SameSite=None; Secure alone isn't enough on a browser
    // that's blocking third-party cookies: the cookie visibly gets stored
    // (shows up in DevTools) but is silently excluded from being *sent* on
    // the SPA's own fetch() calls back to this domain, which looks
    // identical to the SameSite=Lax bug this file already works around.
    attrs.push("Partitioned");
  }
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
  STATE_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
  generateStateNonce,
  getBearerToken,
  buildStateCookie,
  buildClearStateCookie,
  parseCookies,
};
