const Alexa = require("ask-sdk-core");
const intentHandler = require("./intentHandler.js");

const AudioPlayerEventHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith(
      "AudioPlayer.",
    );
  },
  async handle(handlerInput) {
    const audioPlayerEvent = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (audioPlayerEvent === "AudioPlayer.PlaybackFinished") {
      return handlerInput.responseBuilder
        .addAudioPlayerStopDirective()
        .withShouldEndSession(true)
        .getResponse();
    }
    return handlerInput.responseBuilder.getResponse();
  },
};

const PlaybackCommandHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith(
      "PlaybackController",
    );
  },
  async handle(handlerInput) {
    const playback = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (playback === "PlaybackController.PauseCommandIssued") {
      return handlerInput.responseBuilder
        .addAudioPlayerStopDirective()
        .getResponse();
    }
    return handlerInput.responseBuilder.getResponse();
  },
};

const AudioIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.ResumeIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.PauseIntent")
    );
  },
  async handle(handlerInput) {
    const intent = Alexa.getIntentName(handlerInput.requestEnvelope);
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    if (sessionAttributes.adhanPlaybackMode === "apl-video") {
      // Adhan is playing through the custom player's Video component, not
      // the AudioPlayer interface — addAudioPlayerStopDirective() would be a
      // no-op here. Drive the Video directly, and keep its bound isPlaying
      // in sync so the on-screen icon matches what voice just did.
      const isPlaying = intent === "AMAZON.ResumeIntent";
      return handlerInput.responseBuilder
        .addDirective({
          type: "Alexa.Presentation.APL.ExecuteCommands",
          token: sessionAttributes.adhanPlayerToken,
          commands: [
            {
              type: "SetValue",
              componentId: "adhanPlayerRoot",
              property: "isPlaying",
              value: isPlaying,
            },
            {
              type: "ControlMedia",
              componentId: "adhanVideo",
              command: isPlaying ? "play" : "pause",
            },
          ],
        })
        .getResponse();
    }
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
  AudioIntentHandler,
};
