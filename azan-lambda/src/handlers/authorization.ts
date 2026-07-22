import { AlexaResponse } from "../alexa/AlexaResponse";
import { RESPONSE_NAMES, RESPONSE_NAMESPACES } from "../alexa/constants";
import { createErrorResponse } from "../alexa/errorResponse";
import { logger } from "../logging/logger";
import { getLwaTokenResponse, getUserInfo } from "../services/amazonAuth";
import { updateAzanUserInfo } from "../services/azanUsers";
import type { SmartHomeRequest } from "../types/smartHomeRequest";

/**
 * Handles `Alexa.Authorization/AcceptGrant`.
 *
 * Amazon sends this once, when the user links their account. It carries a
 * short-lived authorization code, which we trade for a refresh token and store
 * against the user — that token is what later lets the skill push the azan to
 * their devices, so losing it here means the feature silently never works.
 */
export async function handleAuthorization(
  event: SmartHomeRequest,
): Promise<AlexaResponse> {
  try {
    const authCode = event.directive.payload?.grant?.code;
    if (!authCode) {
      return createErrorResponse(
        "ACCEPT_GRANT_FAILED",
        "Missing authorization code",
      );
    }
    const refreshToken = (await getLwaTokenResponse(authCode)).refresh_token;

    const tokenFromRequest = event.directive.payload?.grantee?.token;
    if (!tokenFromRequest) {
      return createErrorResponse(
        "ACCEPT_GRANT_FAILED",
        "Missing grantee token",
      );
    }

    const userInfo = await getUserInfo(tokenFromRequest);
    // Defensive: the profile body is Amazon's to shape, and a malformed one
    // must not become an unhandled property read below.
    if (!userInfo) {
      return createErrorResponse(
        "ACCEPT_GRANT_FAILED",
        "Failed to get user info",
      );
    }

    await updateAzanUserInfo(userInfo.user_id, { refreshToken });
  } catch (error) {
    logger.error("Account linking failed", { error });
    return createErrorResponse(
      "ACCEPT_GRANT_FAILED",
      "Failed to handle the authorization request",
    );
  }

  const response = new AlexaResponse({
    namespace: RESPONSE_NAMESPACES.authorization,
    name: RESPONSE_NAMES.acceptGrant,
  });
  return response.get();
}
