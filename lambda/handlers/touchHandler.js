const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const { getPrayerTimings } = require("./apiHandler.js");

const MosqueListTouchEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      handlerInput.requestEnvelope.request.arguments[0] === "ListItemSelected"
    );
  },
  async handle(handlerInput) {
    console.log(
      "Request Log in MosqueListTouchEventHandler: ",
      JSON.stringify(handlerInput.requestEnvelope.request)
    );
    const locale = Alexa.getLocale(handlerInput.requestEnvelope);
    const selectedMosque = handlerInput.requestEnvelope.request.arguments[1];
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
      if (error === "Mosque not found") {
        return await helperFunctions.getListOfMosque(handlerInput, requestAttributes.t("mosqueNotRegisteredPrompt"));
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

module.exports = {
  MosqueListTouchEventHandler,
};
