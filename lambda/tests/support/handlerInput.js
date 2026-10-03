/**
 * Minimal but faithful `handlerInput` double.
 *
 * The response builder is the real one from ask-sdk-core, so assertions run
 * against the exact response envelope Alexa would receive (outputSpeech.ssml,
 * shouldEndSession, directives) instead of a hand-rolled approximation.
 */
const Alexa = require("ask-sdk-core");
const { createTranslate } = require("./i18n");

const buildHandlerInput = ({
  locale = "en-US",
  requestType = "IntentRequest",
  intentName,
  slots = {},
  confirmationStatus = "NONE",
  sessionAttributes = {},
  persistentAttributes = {},
  supportedInterfaces = {},
  // Mirrors context.Viewport from a real request — pass e.g.
  // { video: { codecs: ["H_264_42"] } } to simulate a device that supports
  // video (see helperFunctions.deviceSupportsVideo).
  viewport = {},
  timezone = "Europe/Paris",
  distanceUnits = "METRIC",
  timezoneError = null,
  // A linked account is the normal state; pass null to exercise the
  // "please link your account" branch.
  accessToken = "access-token",
  // Only the address-based mosque lookup needs these two. They default to
  // absent so the consent check stays false for every other test.
  consentToken = null,
  deviceAddress = null,
  // false builds an out-of-session request, as a widget tap can be: no
  // `session` in the envelope, and session-attribute access throws exactly as
  // the SDK's AttributesManager does.
  inSession = true,
} = {}) => {
  const session = { ...sessionAttributes };
  let persistent = { ...persistentAttributes };
  const savePersistentAttributes = jest.fn(async () => {});

  const requestEnvelope = {
    ...(inSession ? { session: { new: true, attributes: {} } } : {}),
    context: {
      System: {
        apiEndpoint: "https://api.eu.amazonalexa.com",
        ...(consentToken ? { apiAccessToken: "api-access-token" } : {}),
        device: { deviceId: "device-1", supportedInterfaces },
        user: {
          userId: "user-1",
          ...(accessToken ? { accessToken } : {}),
          ...(consentToken ? { permissions: { consentToken } } : {}),
        },
      },
      Viewport: viewport,
    },
    request: {
      type: requestType,
      requestId: "request-1",
      locale,
      ...(intentName
        ? { intent: { name: intentName, confirmationStatus, slots } }
        : {}),
    },
  };

  const attributesManager = {
    getRequestAttributes: () => requestAttributes,
    getSessionAttributes: () => {
      if (!inSession) {
        throw new Error(
          "Cannot get SessionAttributes from out of session request!",
        );
      }
      return session;
    },
    setSessionAttributes: (next) => {
      if (!inSession) {
        throw new Error(
          "Cannot set SessionAttributes to out of session request!",
        );
      }
      Object.assign(session, next);
    },
    getPersistentAttributes: async () => persistent,
    setPersistentAttributes: (next) => {
      persistent = next;
    },
    savePersistentAttributes,
  };

  const requestAttributes = { t: createTranslate(locale) };

  const serviceClientFactory = {
    getUpsServiceClient: () => ({
      getSystemTimeZone: jest.fn(async () => {
        if (timezoneError) {
          throw timezoneError;
        }
        return timezone;
      }),
      getSystemDistanceUnits: jest.fn(async () => distanceUnits),
    }),
    getDeviceAddressServiceClient: () => ({
      getFullAddress: jest.fn(async () => deviceAddress),
    }),
  };

  return {
    requestEnvelope,
    attributesManager,
    serviceClientFactory,
    responseBuilder: Alexa.ResponseFactory.init(),
    // Exposed for assertions on persistence side effects.
    _savePersistentAttributes: savePersistentAttributes,
    _getPersistentAttributes: () => persistent,
  };
};

/** Extracts the plain spoken text (SSML tags stripped) from a response. */
const spokenText = (response) =>
  (response?.outputSpeech?.ssml || "").replace(/<[^>]*>/g, "").trim();

module.exports = { buildHandlerInput, spokenText };
