const axios = require("axios");
const webSessionHandler = require("./webSessionHandler.js");

const AMAZON_BASE_URL = "https://api.amazon.com";
const AMAZON_AUTHORIZE_URL = "https://www.amazon.com/ap/oa";

// The website logs in against its own LWA Security Profile (webClientId/
// webClientSecret) — a different app than the one the Alexa skill's account
// linking uses (clientId/clientSecret) — and, unlike the skill's flows,
// needs an explicit redirect_uri: Amazon manages the redirect internally for
// skill account linking, but this is a standalone web OAuth flow.

async function handleAuthStart() {
  if (!process.env.webClientId) {
    // /alexa/webClientId (and its siblings) haven't been created in SSM yet
    // — a clear 503 here is much easier to debug than a redirect to Amazon
    // with client_id=undefined.
    console.error(
      "[webAuthHandler] webClientId is not configured — has /alexa/webClientId been created in SSM?",
    );
    return {
      statusCode: 503,
      headers: { "Content-Type": "text/plain" },
      body: "Website login is not configured yet",
    };
  }

  const nonce = webSessionHandler.generateStateNonce();
  const secure = isDeployedOverHttps();
  const params = new URLSearchParams({
    client_id: process.env.webClientId,
    scope: "profile",
    response_type: "code",
    redirect_uri: process.env.WEB_REDIRECT_URI,
    state: nonce,
  });

  return {
    statusCode: 302,
    headers: { Location: `${AMAZON_AUTHORIZE_URL}?${params.toString()}` },
    cookies: [webSessionHandler.buildStateCookie(nonce, { secure })],
  };
}

async function handleAuthCallback(event) {
  const query = event?.queryStringParameters || {};
  const { code, state } = query;
  const cookies = webSessionHandler.parseCookies(event);
  const secure = isDeployedOverHttps();

  // The state check is the load-bearing CSRF protection here — it proves
  // this callback was reached via a redirect we ourselves issued a nonce
  // for, not a forged link pointing a victim's browser at our callback URL.
  if (
    !code ||
    !state ||
    cookies[webSessionHandler.STATE_COOKIE_NAME] !== state
  ) {
    console.error("[webAuthHandler] OAuth state mismatch or missing code");
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/plain" },
      body: "Invalid or missing OAuth state",
      cookies: [webSessionHandler.buildClearStateCookie({ secure })],
    };
  }

  try {
    const tokenResponse = await exchangeCodeForToken(code);
    const userInfo = await getUserInfo(tokenResponse.access_token);
    // Only user_id is ever persisted to the session — name/email are never
    // stored, matching how every existing LWA flow in this repo treats
    // profile data.
    const sessionToken = webSessionHandler.signSessionToken({
      sub: userInfo.user_id,
    });

    return {
      statusCode: 302,
      headers: { Location: process.env.WEB_ORIGIN },
      cookies: [
        webSessionHandler.buildSessionCookie(sessionToken, { secure }),
        webSessionHandler.buildClearStateCookie({ secure }),
      ],
    };
  } catch (error) {
    console.error(
      "[webAuthHandler] LWA login failed:",
      error?.response?.data || error.message,
    );
    return {
      statusCode: 502,
      headers: { "Content-Type": "text/plain" },
      body: "Login with Amazon failed",
      cookies: [webSessionHandler.buildClearStateCookie({ secure })],
    };
  }
}

async function handleAuthLogout() {
  const secure = isDeployedOverHttps();
  return {
    statusCode: 204,
    cookies: [webSessionHandler.buildClearSessionCookie({ secure })],
  };
}

async function handleAuthSession(event) {
  const session = getSessionFromEvent(event);
  if (!session) {
    return {
      statusCode: 401,
      headers: jsonHeaders(),
      body: JSON.stringify({ authenticated: false }),
    };
  }
  return {
    statusCode: 200,
    headers: jsonHeaders(),
    body: JSON.stringify({ authenticated: true, userId: session.sub }),
  };
}

// Shared with the other /me/* route handlers (added in a later phase) so
// they can all resolve "who is calling" the same way.
function getSessionFromEvent(event) {
  const cookies = webSessionHandler.parseCookies(event);
  const token = cookies[webSessionHandler.SESSION_COOKIE_NAME];
  return webSessionHandler.verifySessionToken(token);
}

// Secure cookies are dropped by browsers over plain http:// — local dev
// (localWebApiServer.js, http://localhost) needs them off; a deployed
// Lambda Function URL is always https, so this stays derived from the
// configured redirect URI rather than a separate flag to keep in sync.
function isDeployedOverHttps() {
  return (process.env.WEB_REDIRECT_URI || "").startsWith("https://");
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

async function exchangeCodeForToken(code) {
  const data = new URLSearchParams({
    client_id: process.env.webClientId,
    client_secret: process.env.webClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.WEB_REDIRECT_URI,
  });

  const response = await axios.request({
    method: "post",
    url: `${AMAZON_BASE_URL}/auth/o2/token`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    data,
  });
  console.log("[webAuthHandler] LWA token exchange successful");
  return response.data;
}

async function getUserInfo(accessToken) {
  const response = await axios.request({
    method: "get",
    url: `${AMAZON_BASE_URL}/user/profile`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  console.log("[webAuthHandler] LWA profile fetched");
  return response.data;
}

module.exports = {
  handleAuthStart,
  handleAuthCallback,
  handleAuthLogout,
  handleAuthSession,
  getSessionFromEvent,
};
