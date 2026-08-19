const apiHandler = require("./apiHandler.js");
const webAuthHandler = require("./webAuthHandler.js");
const { buildEligiblePrayerTimes } = require("./routineEligiblePrayers.js");
const validate = require("./webValidation.js");

// The voice UI caps at 5 results (all Alexa can usefully speak); the website
// can render a real list and paginate through it client-side, so it asks for
// more up front rather than round-tripping per page.
const WEB_SEARCH_RESULT_LIMIT = 25;

/**
 * GET /mosques/search — a thin, authenticated proxy over
 * apiHandler.getMosqueList. Authenticated (not open to the public) because
 * every call spends the mawaqit.net API key this Lambda holds; an
 * unauthenticated proxy would let anyone use our key as their own.
 */
async function handleSearchMosques(event) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) {
    return unauthorized();
  }

  const { lat, lon, word } = event?.queryStringParameters || {};
  if (!word && !(lat && lon)) {
    return badRequest("Provide either `word`, or both `lat` and `lon`");
  }
  if (word && !validate.isNonEmptyString(word, 200)) {
    return badRequest("word must be a string up to 200 characters");
  }
  if (lat && !validate.isValidLatitude(lat)) {
    return badRequest("lat must be a number between -90 and 90");
  }
  if (lon && !validate.isValidLongitude(lon)) {
    return badRequest("lon must be a number between -180 and 180");
  }

  try {
    const mosques = await apiHandler.getMosqueList(
      word,
      lat,
      lon,
      WEB_SEARCH_RESULT_LIMIT,
    );
    return ok(mosques);
  } catch (error) {
    if (error.message === "Received Empty Response") {
      // Zero matches is a normal search outcome, not a failure — let the
      // frontend show a friendly "no mosque found" message instead of
      // treating this the same as a broken upstream API.
      return ok([]);
    }
    console.error("[webMosqueHandler] Mosque search failed:", error.message);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Mosque search is temporarily unavailable",
      }),
    };
  }
}

/**
 * GET /mosques/:uuid/times — powers the website's prayer picker, which needs
 * to show (and only offer checkboxes for) prayers the mosque actually has a
 * time for today, same as the voice flow does.
 */
async function handleGetMosqueTimes(event, mosqueUuid) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) {
    return unauthorized();
  }

  if (!validate.isNonEmptyString(mosqueUuid, 200)) {
    return badRequest("Invalid mosque id");
  }

  const { timezone } = event?.queryStringParameters || {};
  if (!validate.isValidTimezone(timezone)) {
    return badRequest("timezone must be a valid IANA time zone identifier");
  }

  try {
    const mosqueTimes = await apiHandler.getPrayerTimings(mosqueUuid, timezone);
    return ok({ prayerTimes: buildEligiblePrayerTimes(mosqueTimes) });
  } catch (error) {
    console.error(
      "[webMosqueHandler] Fetching mosque times failed:",
      error.message,
    );
    const statusCode = error.message === "Mosque not found" ? 404 : 502;
    return {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unable to fetch mosque prayer times" }),
    };
  }
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Not authenticated" }),
  };
}

function badRequest(message) {
  return {
    statusCode: 400,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: message }),
  };
}

function ok(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

module.exports = {
  handleSearchMosques,
  handleGetMosqueTimes,
};
