const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const { getPrayerTimings } = require("./apiHandler.js");

const MosqueListTouchEventHandler = {
  canHandle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      handlerInput.requestEnvelope.request.arguments[0] === "ListItemSelected" &&
      handlerInput.requestEnvelope.request.arguments[1] === requestAttributes.t("titleForMosqueList")
    );
  },
  async handle(handlerInput) {
    console.log(
      "Request Log in MosqueListTouchEventHandler: ",
      JSON.stringify(handlerInput.requestEnvelope.request)
    );
    const locale = Alexa.getLocale(handlerInput.requestEnvelope);
    const selectedMosque = handlerInput.requestEnvelope.request.arguments[2];
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    selectedMosque.primaryText = await helperFunctions.translateText(selectedMosque.primaryText, locale);
    selectedMosque.localisation = await helperFunctions.translateText(selectedMosque.localisation, locale);
    selectedMosque.proximity = parseInt(selectedMosque.proximity)/1000;
    sessionAttributes.persistentAttributes = selectedMosque;
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    try {
      const mosqueTimes = await getPrayerTimings(selectedMosque.uuid);
      sessionAttributes.mosqueTimes = mosqueTimes;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return await helperFunctions.getPrayerTimingsForMosque(
        handlerInput,
        mosqueTimes,
        requestAttributes.t("selectedMosquePrompt", selectedMosque.primaryText)
      );
    } catch (error) {
      console.log("Error in fetching prayer timings: ", error);
      if (error?.message === "Mosque not found") {
        return await helperFunctions.getListOfMosque(handlerInput, requestAttributes.t("mosqueNotRegisteredPrompt"));
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const AdhaanRecitationTouchEventHandler = {
  canHandle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      handlerInput.requestEnvelope.request.arguments[0] === "ListItemSelected" &&
      handlerInput.requestEnvelope.request.arguments[1] === requestAttributes.t("titleForAdhaanReciterList")
    );
  },
  async handle(handlerInput) {
    console.log(
      "Request Log in AdhaanRecitationTouchEventHandler: ",
      JSON.stringify(handlerInput.requestEnvelope.request)
    );
    const selectedRecitation = handlerInput.requestEnvelope.request.arguments[2];
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    sessionAttributes.persistentAttributes.favouriteAdhaan = selectedRecitation;
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("adhanReciterSuccessPrompt", selectedRecitation.primaryText))
      .getResponse();
  },
}

const RoutineListTouchEventHandler = {
  canHandle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      handlerInput.requestEnvelope.request.arguments[0] ===
        "ListItemSelected" &&
      handlerInput.requestEnvelope.request.arguments[1] ===
        requestAttributes.t("titleForPrayerTimeList")
    );
  },
  async handle(handlerInput) {
    console.log(
      "Request Log in RoutineListTouchEventHandler: ",
      JSON.stringify(handlerInput.requestEnvelope.request)
    );
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    try {
      const selectedRoutine = handlerInput.requestEnvelope.request.arguments[2];
      const prayerNames = requestAttributes.t("prayerNames");
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      const automationDirective = helperFunctions.offerAutomation(
        userTimeZone,
        selectedRoutine.time,
        selectedRoutine.name,
        selectedRoutine.namePhoneme === prayerNames[5],
      );
      return handlerInput.responseBuilder
        .addDirective(automationDirective)
        .getResponse();
    } catch (error) {
      console.log("Error in RoutineListTouchEventHandler: ", error);
      if (error?.message === "Unable to fetch user timezone") {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("timezoneErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("routineErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

module.exports = {
  MosqueListTouchEventHandler,
  AdhaanRecitationTouchEventHandler,
  RoutineListTouchEventHandler
};
