const awsSsmHandler = require("./handlers/awsSsmHandler.js");
const webAuthHandler = require("./handlers/webAuthHandler.js");
const webConfigHandler = require("./handlers/webConfigHandler.js");
const webMosqueHandler = require("./handlers/webMosqueHandler.js");

/**
 * Entry point for the MAWAQIT companion website's HTTP API — a Lambda
 * Function URL (payload format 2.0, the same shape API Gateway HTTP API
 * uses). This must never throw: an unhandled error reaches the caller as a
 * raw 500 with no CORS headers, which the browser then reports as an
 * opaque network error instead of a readable failure.
 */
exports.handler = async (event) => {
  try {
    await awsSsmHandler.handler();
    return await route(event);
  } catch (error) {
    console.error("[webApi] Unhandled error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal error" }),
    };
  }
};

async function route(event) {
  const method = event?.requestContext?.http?.method;
  const path = event?.rawPath;

  // Auth (phase 1). Later phases add /mosques/search and /me/* here.
  if (method === "GET" && path === "/auth/start") {
    return webAuthHandler.handleAuthStart();
  }
  if (method === "GET" && path === "/auth/callback") {
    return webAuthHandler.handleAuthCallback(event);
  }
  if (method === "POST" && path === "/auth/logout") {
    return webAuthHandler.handleAuthLogout();
  }
  if (method === "GET" && path === "/auth/session") {
    return webAuthHandler.handleAuthSession(event);
  }

  // Config (phase 2). Later phases add PUT /me/mosque, PUT /me/prayers.
  if (method === "GET" && path === "/me/config") {
    return webConfigHandler.handleGetConfig(event);
  }
  if (method === "PUT" && path === "/me/mosque") {
    return webConfigHandler.handleSaveMosque(event);
  }
  if (method === "PUT" && path === "/me/prayers") {
    return webConfigHandler.handleSavePrayers(event);
  }
  if (method === "GET" && path === "/me/reciters") {
    return webConfigHandler.handleGetReciters(event);
  }
  if (method === "PUT" && path === "/me/reciter") {
    return webConfigHandler.handleSaveReciter(event);
  }

  // Mosque search (phase 3).
  if (method === "GET" && path === "/mosques/search") {
    return webMosqueHandler.handleSearchMosques(event);
  }
  const mosqueTimesMatch = path?.match(/^\/mosques\/([^/]+)\/times$/);
  if (method === "GET" && mosqueTimesMatch) {
    return webMosqueHandler.handleGetMosqueTimes(
      event,
      decodeURIComponent(mosqueTimesMatch[1]),
    );
  }

  return {
    statusCode: 404,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Not found" }),
  };
}
