import { AlexaResponse } from "../alexa/AlexaResponse";
import {
  DOORBELL_INTERFACE,
  RESPONSE_NAMES,
  RESPONSE_NAMESPACES,
} from "../alexa/constants";
import { createErrorResponse } from "../alexa/errorResponse";
import { logger } from "../logging/logger";
import { getUserInfo } from "../services/amazonAuth";
import { updateAzanUserInfo } from "../services/azanUsers";
import type { SmartHomeRequest } from "../types/smartHomeRequest";

/** The endpoint id every user's Azan trigger is derived from. */
const BASE_ENDPOINT_ID = "mawaqit-azan-trigger";

/** Shown as the device name in the Alexa app and spoken by Alexa. */
const ENDPOINT_FRIENDLY_NAME = "MAWAQIT Azan";

/**
 * Shown under the device in the Alexa app. Amazon caps this at 128 characters
 * and rejects anything longer, so `dispatcher.test.ts` guards the length.
 *
 * English only, and not by choice: a Discover directive carries no locale, the
 * Amazon profile carries no locale, and the table that does know the user's
 * language is keyed by the Alexa user id — which this service never sees.
 *
 * The reminder matters because Alexa's own "Doorbell Press Notifications"
 * setting, if left on, fires a notification chime alongside every adhan.
 */
const ENDPOINT_DESCRIPTION =
  "Plays the adhan at each prayer time for your mosque. Reminder: disable 'Doorbell Press Notifications' in the Alexa app.";

/**
 * TODO: Fix this to not accept uncomplete IDs
 * Derives this user's endpoint id from their Amazon account id.
 *
 * An Amazon user id looks like `amzn1.account.XXXX`; the third segment is the
 * account-specific part. Anything shorter is unexpected, so we fall back to the
 * shared base id rather than building a malformed one.
 */
function endpointIdFromUser(userId: string): string {
  const parts = userId.split(".");
  return parts.length > 2
    ? `${BASE_ENDPOINT_ID}-${parts[2]}`
    : BASE_ENDPOINT_ID;
}

/**
 * Handles `Alexa.Discovery/Discover`.
 *
 * Alexa asks what devices this skill exposes. We answer with a single virtual
 * doorbell: that is the mechanism the azan rides on, since a doorbell is the
 * one endpoint type Alexa will announce proactively on a user's devices.
 */
export async function handleDiscovery(
  event: SmartHomeRequest,
): Promise<AlexaResponse> {
  let endpointId = BASE_ENDPOINT_ID;

  try {
    const accessTokenFromDirective = event.directive.payload?.scope?.token;
    // Presence only — the token itself must never reach the logs.
    logger.debug("Discovery requested", {
      hasAccessToken: Boolean(accessTokenFromDirective),
    });

    const userInfo = await getUserInfo(accessTokenFromDirective);

    // No user id means there is nothing to scope or persist, but Alexa must
    // still get an endpoint back or the skill looks broken in the app.
    if (userInfo?.user_id) {
      endpointId = endpointIdFromUser(userInfo.user_id);

      await updateAzanUserInfo(userInfo.user_id, { endpointId });
      logger.info("Endpoint registered", { endpointId });
    }
  } catch (error) {
    logger.error("Discovery failed", { error });
    return createErrorResponse(
      "INTERNAL_ERROR",
      "Failed to handle the discovery request",
    );
  }

  const response = new AlexaResponse({
    namespace: RESPONSE_NAMESPACES.discovery,
    name: RESPONSE_NAMES.discover,
  });

  const capabilityAlexa = response.createPayloadEndpointCapability();
  // Alexa only delivers proactive events to an endpoint that declares
  // Alexa.DoorbellEventSource as proactively reported — this is what lets the
  // azan ring on the user's device.
  const capabilityDoorbell = response.createPayloadEndpointCapability({
    interface: DOORBELL_INTERFACE,
    proactivelyReported: true,
  });

  response.addPayloadEndpoint({
    friendlyName: ENDPOINT_FRIENDLY_NAME,
    endpointId,
    capabilities: [capabilityAlexa, capabilityDoorbell],
    manufacturerName: "MAWAQIT",
    model: "v2",
    description: ENDPOINT_DESCRIPTION,
    displayCategories: ["DOORBELL"],
  });

  return response.get();
}
