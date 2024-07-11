const Alexa = require("ask-sdk-core");
const SkillEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "AlexaSkillEvent.SkillDisabled";
    },
    async handle(handlerInput) {
      const userId = Alexa.getUserId(handlerInput.requestEnvelope);
      console.log(`Skill was disabled for user: ${userId}`);
      try{
          await handlerInput.attributesManager.deletePersistentAttributes();
      }catch(error){
          console.log("Error while deleting persistence attributes :",error);
      }
      
    },
  };

module.exports = {
    SkillEventHandler
}