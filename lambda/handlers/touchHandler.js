const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");

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
    const selectedMosque = handlerInput.requestEnvelope.request.arguments[1];
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.persistentAttributes = selectedMosque;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    return await helperFunctions.getPrayerTimingsForMosque(
      handlerInput,
      selectedMosque,
      " "
    );
  },
};

module.exports = {
  MosqueListTouchEventHandler,
};
