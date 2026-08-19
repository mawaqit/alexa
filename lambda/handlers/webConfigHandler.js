const dbHandler = require("./dynamoDbHandler.js");
const webAuthHandler = require("./webAuthHandler.js");
const apiHandler = require("./apiHandler.js");
const eventBridgeScheduler = require("./eventBridgeScheduler.js");
const {
  CustomDynamoDbPersistenceAdapter,
} = require("../util/CustomDynamoDbPersistenceAdapter.js");
const {
  ROUTINE_ELIGIBLE_PRAYER_NAMES,
  buildEligiblePrayerTimes,
} = require("./routineEligiblePrayers.js");
// Same static reciter list the voice flow's FavoriteAdhaanReciterIntent
// offers (datasources.js) — reused as-is so the website can never drift out
// of sync with what PlayAdhanIntentHandler actually knows how to play.
const { adhaanRecitation } = require("../datasources.js");
const validate = require("./webValidation.js");

/**
 * GET /me/config — resolves "what does this logged-in website user currently
 * have configured", trying the two places that can hold it, in order:
 *
 *  1. mawaqit-alexa-user-data (via the userId-index GSI): the user already
 *     linked their Alexa skill account, so their mosque/prayers live there,
 *     keyed by the Alexa skill id — not something the website has, only the
 *     LWA id the GSI bridges from.
 *  2. mawaqit-alexa-azan-users-data (keyed by the LWA id directly): no Alexa
 *     link yet, but they may have saved a mosque/prayers from the website
 *     already (a "pending" config, applied once they do link — see
 *     applyPendingWebConfig).
 */
async function handleGetConfig(event) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) {
    return unauthorized();
  }

  const linkedUser = await dbHandler.GetPersistenceUserByUserId(session.sub);
  if (linkedUser) {
    const attributes = linkedUser.attributes || {};
    return ok({
      linked: "alexa",
      mosque: mosqueFromAttributes(attributes),
      routinePrayers: attributes.routinePrayers || [],
      favouriteAdhaan: attributes.favouriteAdhaan?.primaryText || null,
    });
  }

  const azanUser = await dbHandler.GetAzanUserInfo(session.sub);
  if (
    azanUser?.pendingMosqueSelection ||
    azanUser?.pendingRoutinePrayers ||
    azanUser?.pendingFavouriteAdhaan
  ) {
    return ok({
      linked: "web-only",
      mosque: azanUser.pendingMosqueSelection || null,
      routinePrayers: azanUser.pendingRoutinePrayers || [],
      favouriteAdhaan: azanUser.pendingFavouriteAdhaan?.primaryText || null,
      pending: true,
      deviceLinked: Boolean(azanUser.refresh_token && azanUser.endpointId),
    });
  }

  return ok({
    linked: "none",
    mosque: null,
    routinePrayers: [],
    favouriteAdhaan: null,
  });
}

/**
 * GET /me/reciters — the fixed list of Azan voices FavoriteAdhaanReciterIntent
 * offers by voice, for the website's radio-button picker. Authenticated for
 * consistency with every other /me/* route, even though the list itself
 * isn't user-specific.
 */
async function handleGetReciters(event) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) return unauthorized();

  return ok(adhaanRecitation.map(({ primaryText }) => ({ primaryText })));
}

/**
 * PUT /me/reciter — stages a favorite-reciter selection as "pending", same
 * pattern as handleSaveMosque/handleSavePrayers. Stores the *whole* matching
 * entry from adhaanRecitation (not just the name) so applyPendingWebConfig
 * can write it straight onto persistentAttributes.favouriteAdhaan in the
 * exact shape PlayAdhanIntentHandler already reads (primaryText/fajrUrl/otherUrl)
 * — see intentHandler.js's FavoriteAdhaanReciterIntentHandler.
 */
async function handleSaveReciter(event) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) return unauthorized();

  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { primaryText } = body || {};
  if (!validate.isNonEmptyString(primaryText)) {
    return badRequest("primaryText is required");
  }

  const reciter = adhaanRecitation.find((r) => r.primaryText === primaryText);
  if (!reciter) {
    return badRequest("Unknown reciter");
  }

  await dbHandler.UpdateAzanUserAttributesAtomic(session.sub, {
    pendingFavouriteAdhaan: reciter,
  });

  return applyAndRespond(session.sub);
}

/**
 * PUT /me/mosque — stages a mosque selection as "pending" on the
 * azan-users-data row (keyed by the LWA id, which is all a website session
 * has) and immediately tries to apply it if the user already has an
 * Alexa-linked record. Never writes straight to the persistence table
 * itself — applyPendingWebConfig is the only thing allowed to do that, so
 * there's exactly one code path that has to get the top-level column
 * promotion (mosqueId/userId/supportId) right.
 */
async function handleSaveMosque(event) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) return unauthorized();

  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return badRequest("Invalid JSON body");
  }

  const {
    uuid,
    primaryText,
    proximity,
    localisation,
    jumua,
    jumua2,
    jumua3,
    image,
    timezone,
  } = body || {};
  if (!validate.isNonEmptyString(uuid)) {
    return badRequest("uuid is required");
  }
  if (!validate.isNonEmptyString(primaryText)) {
    return badRequest("primaryText is required");
  }
  if (!validate.isValidTimezone(timezone)) {
    return badRequest("timezone must be a valid IANA time zone identifier");
  }
  if (!validate.isOptionalFiniteNumber(proximity)) {
    return badRequest("proximity must be a number");
  }
  if (
    !validate.isOptionalString(localisation) ||
    !validate.isOptionalString(jumua) ||
    !validate.isOptionalString(jumua2) ||
    !validate.isOptionalString(jumua3)
  ) {
    return badRequest("localisation/jumua fields must be strings");
  }
  if (!validate.isOptionalHttpUrl(image)) {
    return badRequest("image must be an http(s) URL");
  }

  const pendingMosqueSelection = stripUndefined({
    uuid,
    primaryText,
    proximity,
    localisation,
    jumua,
    jumua2,
    jumua3,
    image,
  });

  await dbHandler.UpdateAzanUserAttributesAtomic(session.sub, {
    pendingMosqueSelection,
    pendingTimezone: timezone,
  });

  return applyAndRespond(session.sub);
}

/**
 * PUT /me/prayers — same staging pattern as handleSaveMosque, for the
 * routine-prayer selection. `prayers` is a list of canonical names (e.g.
 * ["Fajr", "Isha"]) — the website doesn't deal in localized/spoken prayer
 * names at all, only canonical ones, matching how trigger.js matches them.
 */
async function handleSavePrayers(event) {
  const session = webAuthHandler.getSessionFromEvent(event);
  if (!session) return unauthorized();

  let body;
  try {
    body = parseJsonBody(event);
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { prayers, timezone } = body || {};
  if (
    !validate.isStringArray(prayers, {
      maxLength: ROUTINE_ELIGIBLE_PRAYER_NAMES.length,
    })
  ) {
    return badRequest(
      `prayers must be an array of up to ${ROUTINE_ELIGIBLE_PRAYER_NAMES.length} prayer names`,
    );
  }
  const hasUnknownPrayer = prayers.some(
    (name) =>
      !ROUTINE_ELIGIBLE_PRAYER_NAMES.some(
        (canonical) => canonical.toLowerCase() === name.toLowerCase(),
      ),
  );
  if (hasUnknownPrayer) {
    return badRequest(
      `prayers must only contain: ${ROUTINE_ELIGIBLE_PRAYER_NAMES.join(", ")}`,
    );
  }
  if (!validate.isValidTimezone(timezone)) {
    return badRequest("timezone must be a valid IANA time zone identifier");
  }

  await dbHandler.UpdateAzanUserAttributesAtomic(session.sub, {
    pendingRoutinePrayers: prayers,
    pendingTimezone: timezone,
  });

  return applyAndRespond(session.sub);
}

async function applyAndRespond(lwaUserId) {
  const result = await applyPendingWebConfig(lwaUserId);
  return ok({
    saved: true,
    applied: result.applied,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}

/**
 * Applies whatever mosque/prayer selection is staged as "pending" on the
 * azan-users-data row to the real Alexa persistence record. Called from two
 * places, which resolve *which* persistence row to write very differently:
 *
 *  - Directly, in-process, right after a website save (Alexa-first — applies
 *    within the same request). Only the LWA id is known here, so the
 *    Alexa-linked row has to be discovered via the userId-index GSI.
 *  - From interceptors.js's web-first hydration path, on the user's first
 *    Alexa launch after linking. Pass `{ alexaId }` there — the caller is
 *    already inside a live Alexa request and so already knows the Alexa id
 *    directly. This is not just an optimization: the GSI can only find a row
 *    whose attributes.user_id has already been promoted to the top-level
 *    userId column, which for a brand-new user hasn't happened yet at this
 *    point (Alexa.Authorization.Grant only ever writes `{ code }` — see
 *    authHandler.js). Relying on the GSI here would mean hydration could
 *    never fire on a genuinely first-ever launch — a real bug this
 *    parameter exists to avoid reintroducing.
 *
 * Both call sites share this exact function so they can never diverge on
 * the actual merge/scheduling logic. Idempotent: safe to call speculatively
 * (as the web-first hydration path does, on every new session) — it's a
 * no-op once nothing is pending.
 */
async function applyPendingWebConfig(lwaUserId, { alexaId } = {}) {
  let linkedAlexaId = alexaId;

  if (!linkedAlexaId) {
    // Only used to discover *which* Alexa-linked row this LWA id maps to —
    // its own copy of `attributes` is never used (see the consistent
    // re-read right below for why).
    const row = await dbHandler.GetPersistenceUserByUserId(lwaUserId);
    if (!row) {
      return { applied: false, reason: "not-linked" };
    }
    linkedAlexaId = row.id;
  }

  // Always re-read by primary key with a consistent read, rather than
  // trusting the GSI lookup's own snapshot above (GSI queries are
  // eventually consistent in DynamoDB — there's no ConsistentRead option
  // for them at all) or a caller-supplied alexaId's implied freshness. This
  // function is called back-to-back for independent website saves (mosque,
  // then reciter, then prayers, in quick succession from the dashboard) —
  // each one full-replaces the row via CustomDynamoDbPersistenceAdapter, so
  // a stale `existingAttributes` here would silently wipe whatever the
  // *previous* save just wrote the instant this one's PutCommand lands.
  // (No row yet is fine — expected on a first-ever launch — saveAttributes()
  // below creates it.)
  const currentRow = await dbHandler.GetPersistenceUserById(linkedAlexaId);
  const existingAttributes = currentRow?.attributes || {};

  const azanUser = await dbHandler.GetAzanUserInfo(lwaUserId);
  const hasPendingMosque = Boolean(azanUser?.pendingMosqueSelection);
  const hasPendingPrayers = Boolean(azanUser?.pendingRoutinePrayers);
  const hasPendingReciter = Boolean(azanUser?.pendingFavouriteAdhaan);
  if (!hasPendingMosque && !hasPendingPrayers && !hasPendingReciter) {
    return { applied: false, reason: "nothing-pending" };
  }

  // Explicit even when already present: this is what lets saveAttributes()
  // promote the top-level userId column, which is what the userId-index GSI
  // (and therefore the website's own lookups) depend on to find this row.
  const attributes = { ...existingAttributes, user_id: lwaUserId };

  if (hasPendingMosque) {
    const previousMosqueId = attributes.uuid;
    const newMosqueId = azanUser.pendingMosqueSelection.uuid;
    Object.assign(attributes, azanUser.pendingMosqueSelection);

    // A routine schedule is built against a specific mosque's prayer times
    // (${mosqueId}-${prayerName} in EventBridge) — switching mosques makes
    // any existing ones stale. Mirrors SelectMosqueIntentAfterSelectingMosqueHandler
    // in intentHandler.js, which also treats a new mosque as a clean slate
    // for routines (it replaces persistentAttributes wholesale rather than
    // merging), except that handler never actually deletes the orphaned
    // EventBridge schedules — trigger.js just silently finds no matching
    // user for them afterward. Doing the delete here properly, since we
    // have the old mosqueId in hand right now.
    if (
      previousMosqueId &&
      previousMosqueId !== newMosqueId &&
      Array.isArray(attributes.routinePrayers) &&
      attributes.routinePrayers.length > 0
    ) {
      for (const prayer of attributes.routinePrayers) {
        const canonicalName = prayer.canonicalName || prayer.name;
        await eventBridgeScheduler.deleteSchedule(
          previousMosqueId,
          canonicalName,
        );
      }
      attributes.routinePrayers = [];
    }
  }

  if (hasPendingPrayers) {
    const mosqueId = attributes.uuid;
    const timezone = azanUser.pendingTimezone;
    if (!mosqueId) {
      // Trying to pick prayers before ever picking a mosque — nothing to
      // schedule against yet.
      return { applied: false, reason: "no-mosque-selected" };
    }
    if (!timezone) {
      // The browser always sends this alongside a save; only reachable if a
      // prayers-only save somehow raced ahead of any mosque/timezone save.
      console.error(
        `[webConfigHandler] Cannot apply pending routine prayers for ${lwaUserId}: missing pendingTimezone`,
      );
      return { applied: false, reason: "missing-timezone" };
    }
    try {
      attributes.routinePrayers = await reconcileRoutinePrayers({
        mosqueId,
        desiredCanonicalNames: azanUser.pendingRoutinePrayers,
        existingRoutinePrayers: attributes.routinePrayers || [],
        timezone,
      });
    } catch (error) {
      console.error(
        `[webConfigHandler] Failed to reconcile routine prayers for ${lwaUserId}:`,
        error.message,
      );
      return { applied: false, reason: "prayer-times-unavailable" };
    }
  }

  if (hasPendingReciter) {
    // Just data — no EventBridge schedule depends on which reciter is
    // chosen, unlike the mosque/prayers branches above.
    attributes.favouriteAdhaan = azanUser.pendingFavouriteAdhaan;
  }

  // Reuses the same adapter the voice flow's persistence layer uses, rather
  // than a raw PutCommand, so the mosqueId/userId/supportId top-level
  // column promotion trigger.js depends on keeps happening here too.
  const adapter = new CustomDynamoDbPersistenceAdapter({
    tableName: process.env.PERSISTENCE_ADAPTER_TABLE_NAME,
    dynamoDBClient: dbHandler.rawDynamoDbClient,
  });
  await adapter.saveAttributes(
    { session: { user: { userId: linkedAlexaId } } },
    attributes,
  );

  await dbHandler.UpdateAzanUserAttributesAtomic(lwaUserId, {
    pendingMosqueSelection: null,
    pendingRoutinePrayers: null,
    pendingTimezone: null,
    pendingFavouriteAdhaan: null,
  });

  // Returned so callers that hold their own ASK SDK attributesManager (the
  // web-first hydration path in interceptors.js) can push these straight
  // into its cache instead of re-reading — that cache was populated before
  // this write happened, via a completely different adapter instance, so a
  // naive re-fetch through attributesManager.getPersistentAttributes()
  // would silently hand back the stale pre-write value.
  return { applied: true, attributes };
}

/**
 * Diffs the desired canonical prayer names against what's already
 * scheduled, deleting EventBridge schedules for anything dropped and
 * creating/updating one for everything kept — this is the step that makes a
 * website save actually *do* something beyond writing a DynamoDB row (see
 * eventBridgeScheduler.js).
 */
async function reconcileRoutinePrayers({
  mosqueId,
  desiredCanonicalNames,
  existingRoutinePrayers,
  timezone,
}) {
  const desired = new Set(
    desiredCanonicalNames.map((name) => name.toLowerCase()),
  );

  for (const existing of existingRoutinePrayers) {
    const canonicalName = existing.canonicalName || existing.name;
    if (!desired.has((canonicalName || "").toLowerCase())) {
      await eventBridgeScheduler.deleteSchedule(mosqueId, canonicalName);
    }
  }

  const mosqueTimes = await apiHandler.getPrayerTimings(mosqueId, timezone);
  const eligible = buildEligiblePrayerTimes(mosqueTimes);

  const rebuilt = [];
  for (const { canonicalName, time } of eligible) {
    if (!desired.has(canonicalName.toLowerCase())) continue;

    await eventBridgeScheduler.createOrUpdateSchedule({
      mosqueId,
      prayerName: canonicalName,
      time,
      timezone,
    });

    // Voice-created routines carry a localized spoken name/phoneme; the
    // website has no i18n for that, so a prayer added from here starts out
    // with its canonical name for display and is re-derived properly the
    // next time a voice intent touches it (an intentional v1 simplification).
    const existingEntry = existingRoutinePrayers.find(
      (p) =>
        (p.canonicalName || p.name || "").toLowerCase() ===
        canonicalName.toLowerCase(),
    );
    rebuilt.push({
      name: existingEntry?.name || canonicalName,
      canonicalName,
      namePhoneme: existingEntry?.namePhoneme || canonicalName,
      time,
    });
  }

  return rebuilt;
}

function mosqueFromAttributes(attributes) {
  if (!attributes.uuid) return null;
  const {
    uuid,
    primaryText,
    proximity,
    localisation,
    jumua,
    jumua2,
    jumua3,
    image,
  } = attributes;
  return {
    uuid,
    primaryText,
    proximity,
    localisation,
    jumua,
    jumua2,
    jumua3,
    image,
  };
}

function parseJsonBody(event) {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw);
}

function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  );
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
  handleGetConfig,
  handleSaveMosque,
  handleSavePrayers,
  handleGetReciters,
  handleSaveReciter,
  applyPendingWebConfig,
};
