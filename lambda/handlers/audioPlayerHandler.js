const Alexa = require("ask-sdk-core");
const intentHandler = require("./intentHandler.js");

const AudioPlayerEventHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith("AudioPlayer.");
  },
  async handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const PlaybackCommandHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope).startsWith("PlaybackController")
    );
  },
  async handle(handlerInput) {
    const playback = Alexa.getRequestType(handlerInput.requestEnvelope);
    console.log("Playback Command: ", playback);
    switch (playback) {
      case "PlaybackController.PlayCommandIssued":        
      case "PlaybackController.NextCommandIssued":
      case "PlaybackController.PreviousCommandIssued":
        return await intentHandler.PlayAdhanIntentHandler.handle(handlerInput);
      default:
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .withShouldEndSession(true)
            .getResponse()
    }
  },
};

const AudioIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.ResumeIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.PauseIntent"
    );
  },
  async handle(handlerInput) {
    const intent = Alexa.getIntentName(handlerInput.requestEnvelope);
    console.log("Audio Intent: ", intent);
    switch (intent) {
      case "AMAZON.ResumeIntent":
        return await intentHandler.PlayAdhanIntentHandler.handle(handlerInput);
      default:
        return handlerInput.responseBuilder
          .addAudioPlayerStopDirective()
          .withShouldEndSession(true)
          .getResponse();
    }
  },
};



module.exports = {
    AudioPlayerEventHandler,
    PlaybackCommandHandler,
    AudioIntentHandler
}