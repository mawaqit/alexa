const Alexa = require("ask-sdk-core");

const SkillEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "AlexaSkillEvent.SkillDisabled";
    },
    async handle(handlerInput) {
      const userId = Alexa.getUserId(handlerInput.requestEnvelope);
      console.log(`Skill was disabled for user: ${userId}`);
      await handlerInput.attributesManager
        .deletePersistentAttributes()
        .catch((error) => {
          console.error(`Error while deleting data: ${error}`);
        });
      return handlerInput.responseBuilder
        .getResponse();
    },
  };

module.exports = {
    SkillEventHandler
}