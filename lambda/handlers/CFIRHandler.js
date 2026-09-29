const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const intentWithoutSlots = [
  "NextIqamaTimeIntent",
  "MosqueInfoIntent",
  "AllIqamaIntent",
  "LaunchIntent",
  "AllPrayerTimeIntent",
  "HadithIntent",
  "DeleteDataIntent",
];

const CFIRWithoutSlotsHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        `CanFulfillIntentRequest` &&
      intentWithoutSlots.includes(helperFunctions.getIntentName(handlerInput))
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();
    const { persistentAttributes } = sessionAttributes;
    if (!persistentAttributes || !persistentAttributes.uuid) {
      return handlerInput.responseBuilder
        .withCanFulfillIntent({
          canFulfill: "MAYBE",
          slots: {},
        })
        .getResponse();
    }
    return handlerInput.responseBuilder
      .withCanFulfillIntent({
        canFulfill: "YES",
        slots: {},
      })
      .getResponse();
  },
};

const CFIRSelectMosqueAndFavoriteAdhaanReciterIntentHandler = {
  canHandle(handlerInput) {
    const intentName = helperFunctions.getIntentName(handlerInput);
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        `CanFulfillIntentRequest` &&
      (intentName === "SelectMosqueIntent" ||
        intentName === "FavoriteAdhaanReciterIntent")
    );
  },
  async handle(handlerInput) {
    return handlerInput.responseBuilder
      .withCanFulfillIntent({
        canFulfill: "YES",
        slots: {},
      })
      .getResponse();
  },
};

const CFIRNextPrayerTimeAndPlayAdhaanIntentHandler = {
  canHandle(handlerInput) {
    const intentName = helperFunctions.getIntentName(handlerInput);
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        `CanFulfillIntentRequest` &&
      (intentName === "NextPrayerTimeIntent" ||
        intentName === "PlayAdhanIntent")
    );
  },
  async handle(handlerInput) {
    const filledSlots = handlerInput.requestEnvelope.request.intent.slots;
    const slotValues = helperFunctions.getSlotValues(filledSlots);
    const intentName = helperFunctions.getIntentName(handlerInput);
    const { attributesManager } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();
    const { persistentAttributes } = sessionAttributes;
    if (
      (!persistentAttributes || !persistentAttributes.uuid) &&
      intentName !== "PlayAdhanIntent"
    ) {
      return handlerInput.responseBuilder
        .withCanFulfillIntent({
          canFulfill: "MAYBE",
          slots: {},
        })
        .getResponse();
    }

    if (slotValues && !slotValues.prayerName?.isValidated) {
      return handlerInput.responseBuilder
        .withCanFulfillIntent({
          canFulfill: "YES",
          slots: {
            prayerName: {
              canUnderstand: "YES",
              canFulfill: "NO",
            },
          },
        })
        .getResponse();
    }

    if (slotValues?.prayerName?.isValidated) {
      return handlerInput.responseBuilder
        .withCanFulfillIntent({
          canFulfill: "YES",
          slots: {
            prayerName: {
              canUnderstand: "YES",
              canFulfill: "YES",
            },
          },
        })
        .getResponse();
    }

    return handlerInput.responseBuilder
      .withCanFulfillIntent({
        canFulfill: "YES",
        slots: {},
      })
      .getResponse();
  },
};

module.exports = {
  CFIRWithoutSlotsHandler,
  CFIRSelectMosqueAndFavoriteAdhaanReciterIntentHandler,
  CFIRNextPrayerTimeAndPlayAdhaanIntentHandler,
};
