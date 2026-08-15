const axios = require("axios");
const webSessionHandler = require("./webSessionHandler.js");
const authHandler = require("./authHandler.js");

const AMAZON_BASE_URL = "https://api.amazon.com";
const AMAZON_AUTHORIZE_URL = "https://www.amazon.com/ap/oa";
// This file authenticates using webClientId/webClientSecret, not
// /alexa/clientId+clientSecret (the pair authHandler.js/worker.js use for
// the skill's own account-linking token exchange). Confirmed via the LWA
// Security Profile console: webClientId (amzn1.application-oa2-client.
// 914db6741c4f46d4adddd984c312d868) is the one that already has Alexa's own
// account-linking redirect URLs (pitangui/alexa.amazon.co.jp/layla)
// pre-registered on it — i.e. it's the real account-linking client, whatever
// /alexa/clientId in SSM currently holds. Using webClientId/webClientSecret
// here sidesteps that SSM value entirely, which is deliberate: it can't be
// corrected in this environment right now. If /alexa/clientId is ever fixed
// to match, this can switch back — see the git history on this file.
function lwaCallbackUrl() {
  return `${new URL(process.env.WEB_REDIRECT_URI).origin}/oauth/lwa-callback`;
}

// The three domains Alexa itself uses as account-linking redirect_uri
// values (visible on the skill's Account Linking config screen). Amazon's
// own LWA server independently enforces that redirect_uri is registered for
// the client — this is defense in depth, not the only check, so it doesn't
// need to track every region Amazon might ever add.
const ALEXA_REDIRECT_HOSTS = [
  "https://pitangui.amazon.com/",
  "https://alexa.amazon.co.jp/",
  "https://layla.amazon.com/",
];

/**
 * GET /oauth/authorize — the skill's Account Linking "Web Authorization
 * URI" now points here instead of straight at Amazon. Alexa opens this in
 * an in-app browser when a user taps "Link Account", passing the same
 * query params it would otherwise send directly to Amazon's authorize
 * endpoint.
 *
 * This does *not* replace Amazon as the account-linking authority — see
 * the plan's "passthrough, not a custom OAuth provider" decision. It
 * inserts an LWA login (using webClientId — the confirmed-real account-
 * linking client, see the comment up top) plus the existing mosque/
 * reciter/prayer config UI, before handing off to handleOAuthCompleteLinking,
 * which bounces the browser back through Amazon's *real* authorize endpoint
 * to complete the standard flow. `Access Token URI`, `Client ID`, and
 * `Client Secret` in the Account Linking config are unchanged — Amazon
 * still mints the real token, so authHandler.js/worker.js/alexaEventSender.js
 * need no changes at all.
 */
async function handleOAuthAuthorize(event) {
  const query = event?.queryStringParameters || {};
  const { client_id, redirect_uri, state, response_type, scope } = query;

  if (response_type !== "code") {
    return badRequest("Unsupported response_type");
  }
  if (!redirect_uri || !state) {
    return badRequest("redirect_uri and state are required");
  }
  // client_id is whatever Alexa's Account Linking config has "Your Client
  // ID" set to — compared against webClientId, not process.env.clientId,
  // per the comment up top.
  if (client_id !== process.env.webClientId) {
    return badRequest("Unknown client_id");
  }
  if (!ALEXA_REDIRECT_HOSTS.some((host) => redirect_uri.startsWith(host))) {
    console.error(
      "[webAlexaLinkHandler] redirect_uri is not a known Alexa host:",
      redirect_uri,
    );
    return badRequest("Unrecognized redirect_uri");
  }

  // Alexa's own redirect_uri/state/scope travel through the LWA hop inside
  // the `state` param we send Amazon below, not a cookie — Amazon round-trips
  // `state` verbatim back to handleOAuthLwaCallback regardless of what
  // browser is driving the flow, which a cookie can't be relied on to do: an
  // earlier cookie-based version of this broke specifically inside Alexa's
  // own in-app browser (used for account linking) even though the identical
  // cookie mechanics work fine in a normal desktop browser for the site's
  // own /auth/start+/auth/callback login. Signed, so handleOAuthLwaCallback
  // can trust it wasn't tampered with in transit.
  const linkToken = webSessionHandler.signSessionToken(
    { redirectUri: redirect_uri, state, scope },
    { expiresInSeconds: 30 * 60 },
  );

  // scope=profile:user_id, not the full profile scope: this LWA Security
  // Profile rejected "profile" outright ("unknown scope", confirmed by
  // hand). profile:user_id returns just { user_id } from /user/profile,
  // which is all authHandler.getUserInfo below actually uses.
  const params = new URLSearchParams({
    client_id: process.env.webClientId,
    scope: "profile:user_id",
    response_type: "code",
    redirect_uri: lwaCallbackUrl(),
    state: linkToken,
  });

  return {
    statusCode: 302,
    headers: { Location: `${AMAZON_AUTHORIZE_URL}?${params.toString()}` },
  };
}

/**
 * GET /oauth/lwa-callback — Amazon redirects here after the login triggered
 * by handleOAuthAuthorize, echoing back the `state` we sent (Alexa's
 * redirect_uri/state/scope, signed). Its own LWA round-trip (client_id/
 * client_secret/redirect_uri = this route) rather than a reuse of the
 * website's own /auth/start+/auth/callback, even though both ultimately use
 * webClientId — this one needs a different redirect_uri (this route, not
 * /auth/callback) and a different post-login destination (back into the
 * linking flow, not straight to the dashboard), so it's its own small
 * round-trip rather than threading an extra "why am I here" flag through
 * the shared one.
 */
async function handleOAuthLwaCallback(event) {
  const query = event?.queryStringParameters || {};
  const { code, state } = query;
  const linkPayload = webSessionHandler.verifySessionToken(state);

  if (!code || !linkPayload?.redirectUri || !linkPayload?.state) {
    console.error("[webAlexaLinkHandler] LWA state mismatch or missing code");
    return badRequest("Invalid or missing OAuth state");
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code);
    const userInfo = await authHandler.getUserInfo(tokenResponse.access_token);
    const sessionToken = webSessionHandler.signSessionToken({
      sub: userInfo.user_id,
    });

    // Both the session token and Alexa's own redirect_uri/state/scope
    // (still signed, forwarded as-is from the `state` param above — no need
    // to re-sign) travel via the URL fragment now, picked up by client.ts's
    // bootstrapSessionFromUrl. See the comment on handleOAuthAuthorize for
    // why this moved off cookies entirely.
    const destination = new URL(process.env.WEB_ORIGIN);
    destination.hash = new URLSearchParams({
      session: sessionToken,
      link: state,
    }).toString();

    return {
      statusCode: 302,
      headers: { Location: destination.toString() },
    };
  } catch (error) {
    console.error(
      "[webAlexaLinkHandler] LWA login failed:",
      error?.response?.data || error.message,
    );
    return {
      statusCode: 502,
      headers: { "Content-Type": "text/plain" },
      body: "Login with Amazon failed",
    };
  }
}

async function exchangeCodeForToken(code) {
  const data = new URLSearchParams({
    client_id: process.env.webClientId,
    client_secret: process.env.webClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: lwaCallbackUrl(),
  });

  const response = await axios.request({
    method: "post",
    url: `${AMAZON_BASE_URL}/auth/o2/token`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    data,
  });
  console.log("[webAlexaLinkHandler] LWA token exchange successful");
  return response.data;
}

/**
 * GET /oauth/complete-linking — the "Continue to Alexa" action's target.
 * Redirects the browser to Amazon's real authorize endpoint one more time,
 * using Alexa's own redirect_uri/state/scope (captured by handleOAuthAuthorize,
 * carried through as the `link` token) — completing the standard
 * account-linking handshake. The browser already has an active Amazon
 * session from the login step above, so this is typically an instant bounce
 * (or a single consent click), not a second full login.
 *
 * Reached via a plain `<a href>` navigation (client.ts's getCompleteLinkingUrl),
 * not a fetch() — it ends on Amazon's own domain, which a fetch() can't
 * navigate to. A plain link can't carry an Authorization header, so both the
 * session and link tokens are embedded as query params instead. Same
 * exposure as the code/state params already flowing through this exact
 * redirect chain, and both tokens are short-lived.
 */
async function handleOAuthCompleteLinking(event) {
  const query = event?.queryStringParameters || {};
  const session = webSessionHandler.verifySessionToken(query.session);
  if (!session) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/plain" },
      body: "Not logged in — start account linking again from the Alexa app",
    };
  }

  const linkPayload = webSessionHandler.verifySessionToken(query.link);
  if (!linkPayload?.redirectUri || !linkPayload?.state) {
    return badRequest("No pending Alexa account-linking request");
  }

  const params = new URLSearchParams({
    client_id: process.env.webClientId,
    response_type: "code",
    redirect_uri: linkPayload.redirectUri,
    state: linkPayload.state,
    scope: linkPayload.scope || "profile",
  });

  return {
    statusCode: 302,
    headers: { Location: `${AMAZON_AUTHORIZE_URL}?${params.toString()}` },
  };
}

function badRequest(message) {
  return {
    statusCode: 400,
    headers: { "Content-Type": "text/plain" },
    body: message,
  };
}

module.exports = {
  handleOAuthAuthorize,
  handleOAuthLwaCallback,
  handleOAuthCompleteLinking,
};
