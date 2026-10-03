const Alexa = require("ask-sdk-core");
const { deleteUserDataEverywhere } = require("./userDataCleanup");
const { clearWidgetDataForUser } = require("./widgetRegistry");

const SkillEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "AlexaSkillEvent.SkillDisabled"
    );
  },
  /**
   * Attempts to clear account-wide widget data, delete dev/prod user rows,
   * and clear SDK persistence. Cleanup failures are caught independently;
   * returns an empty skill response.
   */
  async handle(handlerInput) {
    const userId = Alexa.getUserId(handlerInput.requestEnvelope);
    console.log(`Skill was disabled for user: ${userId}`);
    // Wipes every widget's data on all of the user's devices. Handles its own
    // errors, so the cleanup below always runs.
    await clearWidgetDataForUser(handlerInput);
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
