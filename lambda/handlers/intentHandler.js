const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");

const SelectMosqueIntentAfterSelectingMosqueHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SelectMosqueIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "selectedMosque")
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
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    return await helperFunctions.getPrayerTimingsForMosque(
      handlerInput,
      selectedMosqueDetails,
      " "
    );
  },
};

module.exports = {
  SelectMosqueIntentAfterSelectingMosqueHandler,
}; 