const Alexa = require("ask-sdk-core");
const intentHandler = require("./intentHandler.js");
const helperFunctions = require("../helperFunctions.js");

const ADHAN_PLAYER_ROOT_ID = "adhanPlayerRoot";
const ADHAN_VIDEO_ID = "adhanVideo";

/**
 * Builds the Alexa.Presentation.APL.ExecuteCommands payload that drives the
 * custom Adhan player's Video component from the backend (voice
 * pause/resume/stop). This is the only place adhanPlayerRoot/adhanVideo are
 * hardcoded — see adhanPlayerApl.json's top-level description for the
 * doc<->backend contract this relies on.
 */
const buildAdhanPlayerCommands = (token, { isPlaying, hasEnded = false }) => {
  const commands = [
    {
      type: "SetValue",
      componentId: ADHAN_PLAYER_ROOT_ID,
      property: "isPlaying",
      value: isPlaying,
    },
    {
      type: "ControlMedia",
      componentId: ADHAN_VIDEO_ID,
      command: isPlaying ? "play" : "pause",
    },
  ];
  if (hasEnded) {
    commands.push({
      type: "SetValue",
      componentId: ADHAN_PLAYER_ROOT_ID,
      property: "hasEnded",
      value: true,
    });
  }
  return {
    type: "Alexa.Presentation.APL.ExecuteCommands",
    token,
    commands,
  };
};

/**
 * Clears adhanPlaybackMode/adhanPlayerToken, unless the incoming APL
 * UserEvent carries a document token that doesn't match the one currently
 * on screen — a stale event from a document already superseded by a later
 * render (see AddDirectiveResponseInterceptor) shouldn't wipe the state of
 * a player that's actually still running under a newer token.
 */
const clearAdhanPlayerStateIfCurrent = (handlerInput) => {
  const sessionAttributes =
    handlerInput.attributesManager.getSessionAttributes();
  const eventToken = handlerInput.requestEnvelope.request?.token;
  if (
    sessionAttributes.adhanPlaybackMode &&
    eventToken &&
    eventToken !== sessionAttributes.adhanPlayerToken
  ) {
    return;
  }
  delete sessionAttributes.adhanPlaybackMode;
  delete sessionAttributes.adhanPlayerToken;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
};

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
        .addDirective(
          buildAdhanPlayerCommands(sessionAttributes.adhanPlayerToken, {
            isPlaying,
          }),
        )
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

/**
 * Adhan-specific half of "Alexa, stop"/"Alexa, cancel". Returns a response
 * when the adhan is actually playing in one of the two modes, or null so
 * the generic CancelAndStopIntentHandler in index.js falls through to its
 * normal speak-only behavior. Exported here — rather than living inline in
 * index.js, which exports nothing but `handler` — so this branch is
 * unit-testable.
 */
const getAdhanStopResponse = (handlerInput, speakOutput) => {
  const sessionAttributes =
    handlerInput.attributesManager.getSessionAttributes();

  if (sessionAttributes.adhanPlaybackMode === "apl-video") {
    // Without this, "Alexa, stop" just spoke a prompt while the Adhan kept
    // playing through the Video component underneath.
    const stopDirective = buildAdhanPlayerCommands(
      sessionAttributes.adhanPlayerToken,
      { isPlaying: false, hasEnded: true },
    );
    delete sessionAttributes.adhanPlaybackMode;
    delete sessionAttributes.adhanPlayerToken;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .addDirective(stopDirective)
      .withShouldEndSession(true)
      .getResponse();
  }

  // Unlike a session attribute, context.AudioPlayer.playerActivity is
  // delivered on every customer-initiated request from an AudioPlayer
  // device regardless of session state — the right signal here, since the
  // legacy AudioPlayer flow ends its session the moment playback starts.
  const playerActivity =
    handlerInput.requestEnvelope.context?.AudioPlayer?.playerActivity;
  if (playerActivity === "PLAYING" || playerActivity === "PAUSED") {
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .addAudioPlayerStopDirective()
      .withShouldEndSession(true)
      .getResponse();
  }

  return null;
};

/**
 * The custom player's Video component reports finishing via SendEvent
 * (adhanPlayerApl.json onEnd) rather than the AudioPlayer.PlaybackFinished
 * request AudioPlayerEventHandler above handles — this is its counterpart
 * for the apl-video mode.
 */
const AdhanPlaybackFinishedEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) ===
        "ADHAN_PLAYBACK_FINISHED"
    );
  },
  async handle(handlerInput) {
    clearAdhanPlayerStateIfCurrent(handlerInput);
    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

/**
 * Fired by adhanPlayerApl.json's onTrackFail when the mp3 URL fails to
 * load — without this, a broken/expired URL left the player silently stuck
 * on screen with adhanPlaybackMode/adhanPlayerToken never cleared.
 */
const AdhanPlaybackFailedEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) ===
        "ADHAN_PLAYBACK_FAILED"
    );
  },
  async handle(handlerInput) {
    clearAdhanPlayerStateIfCurrent(handlerInput);
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("adhaanErrorPrompt"))
      .withShouldEndSession(true)
      .getResponse();
  },
};

module.exports = {
  AudioPlayerEventHandler,
  PlaybackCommandHandler,
  AudioIntentHandler,
  getAdhanStopResponse,
  AdhanPlaybackFinishedEventHandler,
  AdhanPlaybackFailedEventHandler,
  buildAdhanPlayerCommands,
};
