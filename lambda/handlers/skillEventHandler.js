const Alexa = require("ask-sdk-core");
const { deleteUserDataEverywhere } = require("./userDataCleanup");

const SkillEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "AlexaSkillEvent.SkillDisabled"
    );
  },
  async handle(handlerInput) {
    const userId = Alexa.getUserId(handlerInput.requestEnvelope);
    console.log(`Skill was disabled for user: ${userId}`);
    // Sweeps dev and prod alike: this event may reach either stage's Lambda
    // whichever stage holds the data. Left behind, an azan row keeps the
    // adhan pushing to a user who disabled the skill.
    try {
      await deleteUserDataEverywhere(handlerInput);
    } catch (error) {
      console.error(`Error while deleting user data: ${error}`);
    }
    try {
      await handlerInput.attributesManager.deletePersistentAttributes();
    } catch (error) {
      console.error(`Error while deleting persistent attributes: ${error}`);
    }
    return handlerInput.responseBuilder.getResponse();
  },
};

module.exports = {
  SkillEventHandler,
};
