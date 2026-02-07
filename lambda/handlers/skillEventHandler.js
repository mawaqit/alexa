const Alexa = require("ask-sdk-core");
const { DeleteUserInfo } = require("./dynamoDbHandler");

const SkillEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "AlexaSkillEvent.SkillDisabled";
    },
    async handle(handlerInput) {
      const userId = Alexa.getUserId(handlerInput.requestEnvelope);
      console.log(`Skill was disabled for user: ${userId}`);
      try {
        await DeleteUserInfo(userId);
      } catch (error) {
        console.error(`Error while deleting user info: ${error}`);
      }
      try {
        await handlerInput.attributesManager.deletePersistentAttributes();
      } catch (error) {
        console.error(`Error while deleting persistent attributes: ${error}`);
      }
      return handlerInput.responseBuilder
        .getResponse();
    },
  };

module.exports = {
    SkillEventHandler
}