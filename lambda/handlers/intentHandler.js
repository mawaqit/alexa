const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const { getPrayerTimings } = require("./apiHandler.js");
const moment = require("moment-timezone");

const SelectMosqueIntentStartedHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SelectMosqueIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "selectedMosque") &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "searchWord")
    );
  },
  handle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const currentIntent = request.intent;
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("mosqueSearchWordPrompt"))
      .addElicitSlotDirective("searchWord", currentIntent)
      .getResponse();
  },
};

const SelectMosqueIntentSearchWordHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SelectMosqueIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "selectedMosque") &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "searchWord")
    );
  },
  async handle(handlerInput) {
    return await helperFunctions.getListOfMosqueBasedOnCity(handlerInput);
  },
};

const SelectMosqueIntentAfterSelectingMosqueHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SelectMosqueIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "selectedMosque") &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "searchWord")
    );
  },
  async handle(handlerInput) {
    const selectedMosque = Alexa.getSlotValue(
      handlerInput.requestEnvelope,
      "selectedMosque"
    );
    console.log("Selected Mosque: ", selectedMosque);
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const mosqueList = sessionAttributes.mosqueList;
    const selectedMosqueDetails = mosqueList[parseInt(selectedMosque) - 1];
    if (!selectedMosqueDetails) {
      return helperFunctions.createResponseDirectiveForMosqueList(
        handlerInput,
        mosqueList,
        requestAttributes.t("unableToFindMosquePrompt")
      );
    }
    console.log("Selected Mosque Details: ", selectedMosqueDetails);
    sessionAttributes.persistentAttributes = selectedMosqueDetails;
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    try {
      const mosqueTimes = await getPrayerTimings(selectedMosqueDetails.uuid);
      sessionAttributes.mosqueTimes = mosqueTimes;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return await helperFunctions.getPrayerTimingsForMosque(
        handlerInput,
        mosqueTimes,
        " "
      );
    } catch (error) {
      console.log("Error in fetching prayer timings: ", error);
      if (error === "Mosque not found") {
        return await helperFunctions.getListOfMosque(handlerInput);
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const NextPrayerTimeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "NextPrayerTimeIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const { persistentAttributes, mosqueTimes } = sessionAttributes;
    if (!persistentAttributes || !persistentAttributes.uuid) {
      return await helperFunctions.checkForPersistenceData(handlerInput);
    }
    const { primaryText } = persistentAttributes;
    const prayerName = Alexa.getSlotValue(
      handlerInput.requestEnvelope,
      "prayerName"
    );
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const mosqueTimesData = mosqueTimes;
    const prayerNameResolvedId = helperFunctions.getResolvedId(
      handlerInput.requestEnvelope,
      "prayerName"
    );
    console.log("Prayer Name Resolved Id: ", prayerNameResolvedId);
    const prayerNameFromData = helperFunctions.getResolvedValue(
      handlerInput.requestEnvelope,
      "prayerName"
    );
    console.log("Prayer Name: ", prayerName);
    const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
    const currentDateTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: userTimeZone })
    );
    const now = moment(currentDateTime);
    const currentMoment = moment(now.format("YYYY-MM-DDTHH:mm"));
    console.log("Now: ", JSON.stringify(now));
    console.log("Prayer Name From Data: ", prayerNameFromData);
    if (parseInt(prayerNameResolvedId) < 5) {
      const timeForNextPrayer =
        mosqueTimesData.times[parseInt(prayerNameResolvedId)];
      return helperFunctions.getPrayerTimeForSpecificPrayer(
        handlerInput,
        primaryText,
        timeForNextPrayer,
        currentMoment,
        now,
        prayerNameFromData
      );
    }
    switch (parseInt(prayerNameResolvedId)) {
      case 5:
        // Extract only the Jumu'ah times
        const jumuaTimes = [
          mosqueTimesData.jumua,
          mosqueTimesData.jumua2,
          mosqueTimesData.jumua3,
        ];
        // Find the first non-null Jumu'ah time
        const firstNonNullJumua = jumuaTimes.find((time) => time !== null);
        if (firstNonNullJumua) {
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t(
                "nextPrayerTimeSpecificPrompt",
                primaryText,
                prayerNameFromData,
                firstNonNullJumua
              )
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("noPrayerTimePrompt"), prayerNameFromData)
          .withShouldEndSession(true)
          .getResponse();
      case 6:
        // Extract only the Eid times
        const eidTimes = [
          mosqueTimesData.aidPrayerTime,
          mosqueTimesData.aidPrayerTime2,
        ];
        // Find the first non-null Eid time
        const firstNonNullEid = eidTimes.find((time) => time !== null);
        if (firstNonNullEid) {
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t(
                "nextPrayerTimeSpecificPrompt",
                primaryText,
                prayerNameFromData,
                firstNonNullEid
              )
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("noPrayerTimePrompt", prayerNameFromData))
          .withShouldEndSession(false)
          .getResponse();
      case 7:
        const firstNonNullShuruq = mosqueTimesData.shuruq;
        if (firstNonNullShuruq) {
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t(
                "shuruqPrompt",
                primaryText,
                firstNonNullShuruq
              )
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("noPrayerTimePrompt", prayerNameFromData))
          .withShouldEndSession(false)
          .getResponse();
    }
  },
};

module.exports = {
  SelectMosqueIntentAfterSelectingMosqueHandler,
  SelectMosqueIntentSearchWordHandler,
  SelectMosqueIntentStartedHandler,
  NextPrayerTimeIntentHandler,
};
