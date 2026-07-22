import { AlexaResponse } from "./AlexaResponse";
import { RESPONSE_NAMES } from "./constants";
import type { ErrorResponseType } from "../types/smartHomeResponse";

/**
 * Builds the Smart Home ErrorResponse envelope.
 *
 * Every failure path in this Lambda returns one of these rather than throwing:
 * an exception escaping the handler reaches Alexa as an opaque timeout, which
 * tells the user nothing and tells us nothing either.
 */
export function createErrorResponse(
  type: ErrorResponseType,
  message: string,
): AlexaResponse {
  const response = new AlexaResponse({
    name: RESPONSE_NAMES.error,
    payload: { type, message },
  });
  return response.get();
}
