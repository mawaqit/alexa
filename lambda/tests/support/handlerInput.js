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
  sessionAttributes = {},
  persistentAttributes = {},
  supportedInterfaces = {},
  timezone = "Europe/Paris",
  distanceUnits = "METRIC",
  timezoneError = null,
} = {}) => {
  const session = { ...sessionAttributes };
  let persistent = { ...persistentAttributes };
  const savePersistentAttributes = jest.fn(async () => {});

  const requestEnvelope = {
    session: { new: true, attributes: {} },
    context: {
      System: {
        apiEndpoint: "https://api.eu.amazonalexa.com",
        device: { deviceId: "device-1", supportedInterfaces },
        user: { userId: "user-1" },
      },
    },
    request: {
      type: requestType,
      requestId: "request-1",
      locale,
      ...(intentName
        ? { intent: { name: intentName, confirmationStatus: "NONE", slots } }
        : {}),
    },
  };

  const attributesManager = {
    getRequestAttributes: () => requestAttributes,
    getSessionAttributes: () => session,
    setSessionAttributes: (next) => Object.assign(session, next),
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
