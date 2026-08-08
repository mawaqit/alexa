/**
 * String literals defined by the Alexa Smart Home API. They are not ours to
 * choose, so they live in one place rather than inline at each use — a typo in
 * any of them is rejected by Amazon at runtime with no useful error.
 */

/** Namespaces this Lambda answers. Compared lowercased: Alexa varies the case. */
export const SUPPORTED_NAMESPACES = {
  authorization: "alexa.authorization",
  discovery: "alexa.discovery",
} as const;

/** Namespaces exactly as they must appear on a response we build. */
export const RESPONSE_NAMESPACES = {
  authorization: "Alexa.Authorization",
  discovery: "Alexa.Discovery",
} as const;

export const RESPONSE_NAMES = {
  acceptGrant: "AcceptGrant.Response",
  discover: "Discover.Response",
  error: "ErrorResponse",
} as const;

/**
 * Responses that must not carry an `endpoint` block — Amazon rejects the
 * message if they do.
 */
export const ENDPOINTLESS_RESPONSES: readonly string[] = [
  RESPONSE_NAMES.acceptGrant,
  RESPONSE_NAMES.discover,
];

/** The interface that lets the azan ring on a user's device. */
export const DOORBELL_INTERFACE = "Alexa.DoorbellEventSource";

/** The Smart Home payload version this skill speaks — the only one it accepts. */
export const PAYLOAD_VERSION = "3";
