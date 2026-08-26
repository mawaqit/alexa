// The Adhan player deliberately avoids Alexa's AudioPlayer interface on
// screen-capable devices: an AudioPlayer.Play directive makes Alexa show its
// own system Now-Playing card, which would immediately cover the custom
// MAWAQIT-styled player screen. These tests guard that fork — APL-capable
// devices must get the custom RenderDocument path and never an AudioPlayer
// directive, while audio-only devices must keep working exactly as before.
//
// They also guard the state machine that lets voice pause/resume/stop drive
// whichever mechanism is actually playing (adhanPlaybackMode/adhanPlayerToken),
// and the cleanup that keeps that state from going stale.
const {
  PlayAdhanIntentHandler,
  PlayAdhanTaskHandler,
} = require("../handlers/intentHandler.js");
const {
  AudioIntentHandler,
  getAdhanStopResponse,
  AdhanPlaybackFinishedEventHandler,
  AdhanPlaybackFailedEventHandler,
} = require("../handlers/audioPlayerHandler.js");
const { AddDirectiveResponseInterceptor } = require("../interceptors.js");
const adhanPlayerApl = require("../aplDocuments/adhanPlayerApl.json");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const { TODAY_TIMES, freezeAt } = require("./support/fixtures");

const TZ = "Europe/Paris";
const VIDEO_CAPABLE_VIEWPORT = { video: { codecs: ["H_264_42"] } };

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  freezeAt("2026-07-16 04:00", TZ); // before Fajr (05:30) — deterministic "next prayer"
});

afterEach(() => {
  jest.useRealTimers();
});

const buildPlayAdhanInput = (supportedInterfaces, viewport = {}) =>
  buildHandlerInput({
    intentName: "PlayAdhanIntent",
    sessionAttributes: {
      persistentAttributes: { uuid: "mosque-uuid" },
    },
    supportedInterfaces,
    viewport,
    timezone: TZ,
  });

describe("PlayAdhanIntentHandler", () => {
  it("renders the custom APL video player instead of an AudioPlayer directive when the device supports APL and video", async () => {
    const handlerInput = buildPlayAdhanInput(
      { "Alexa.Presentation.APL": {}, AudioPlayer: {} },
      VIDEO_CAPABLE_VIEWPORT,
    );

    const response = await PlayAdhanIntentHandler.handle(handlerInput);

    const aplDirective = response.directives.find(
      (directive) => directive.type === "Alexa.Presentation.APL.RenderDocument",
    );
    expect(aplDirective).toBeDefined();
    expect(aplDirective.datasources.data.properties.audioUrl).toMatch(/\.mp3$/);
    // The whole point of this fork: no AudioPlayer.Play directive, so
    // Alexa's system Now-Playing card never gets a chance to cover the
    // custom screen.
    expect(response.directives.some((d) => d.type === "AudioPlayer.Play")).toBe(
      false,
    );
    // shouldEndSession is deliberately omitted: `false` reopens the mic for
    // a spoken follow-up (unwanted while the Adhan plays), `true` drops
    // sessionAttributes before the next request, breaking voice
    // pause/resume/stop and the onEnd SendEvent's route back to the skill.
    expect(response.shouldEndSession).toBeUndefined();

    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBe("apl-video");
    // AudioIntentHandler/getAdhanStopResponse need this exact token to
    // target the on-screen document later.
    expect(sessionAttributes.adhanPlayerToken).toBe(aplDirective.token);
  });

  it("falls back to the AudioPlayer directive when APL is supported but video isn't", async () => {
    // Some Alexa.Presentation.APL devices still can't play video — a Video
    // component there silently renders nothing, which for this player means
    // no audio either, since the Video *is* the playback mechanism.
    const handlerInput = buildPlayAdhanInput({
      "Alexa.Presentation.APL": {},
      AudioPlayer: {},
    });

    const response = await PlayAdhanIntentHandler.handle(handlerInput);

    expect(response.directives.some((d) => d.type === "AudioPlayer.Play")).toBe(
      true,
    );
    expect(
      response.directives.some(
        (d) => d.type === "Alexa.Presentation.APL.RenderDocument",
      ),
    ).toBe(false);
    // No session attribute is written for this path any more — it used to
    // be set on a response that ends the session in the same call, making
    // it unreadable by any later request. context.AudioPlayer.playerActivity
    // (see getAdhanStopResponse) is the real signal now.
    expect(
      handlerInput.attributesManager.getSessionAttributes().adhanPlaybackMode,
    ).toBeUndefined();
  });

  it("falls back to the AudioPlayer directive on audio-only devices", async () => {
    const handlerInput = buildPlayAdhanInput({ AudioPlayer: {} });

    const response = await PlayAdhanIntentHandler.handle(handlerInput);

    expect(response.directives.some((d) => d.type === "AudioPlayer.Play")).toBe(
      true,
    );
    expect(
      response.directives.some(
        (d) => d.type === "Alexa.Presentation.APL.RenderDocument",
      ),
    ).toBe(false);
  });

  it("asks the user to link an AudioPlayer-capable device when neither interface is supported", async () => {
    const handlerInput = buildPlayAdhanInput({});

    const response = await PlayAdhanIntentHandler.handle(handlerInput);

    expect(response.directives).toBeUndefined();
    expect(response.outputSpeech.ssml).toContain(
      "playing the adhan isn't available",
    );
  });
});

describe("PlayAdhanTaskHandler", () => {
  // This is the routine/task-triggered entry point — how the adhan actually
  // fires for most users — sharing renderAdhanPlayer with the voice intent
  // above rather than a second, drifting copy of the same branch.
  const buildTaskInput = (supportedInterfaces, viewport = {}) =>
    buildHandlerInput({
      requestType: "LaunchRequest",
      timezone: TZ,
      sessionAttributes: {
        persistentAttributes: { uuid: "mosque-uuid" },
        mosqueTimes: { times: TODAY_TIMES },
      },
      supportedInterfaces,
      viewport,
    });

  it("renders the custom APL video player when the device supports APL and video", async () => {
    const handlerInput = buildTaskInput(
      { "Alexa.Presentation.APL": {}, AudioPlayer: {} },
      VIDEO_CAPABLE_VIEWPORT,
    );

    const response = await PlayAdhanTaskHandler.handle(handlerInput);

    expect(
      response.directives.some(
        (d) => d.type === "Alexa.Presentation.APL.RenderDocument",
      ),
    ).toBe(true);
    expect(response.directives.some((d) => d.type === "AudioPlayer.Play")).toBe(
      false,
    );
    expect(
      handlerInput.attributesManager.getSessionAttributes().adhanPlaybackMode,
    ).toBe("apl-video");
  });

  it("falls back to the AudioPlayer directive when video isn't supported", async () => {
    const handlerInput = buildTaskInput({
      "Alexa.Presentation.APL": {},
      AudioPlayer: {},
    });

    const response = await PlayAdhanTaskHandler.handle(handlerInput);

    expect(response.directives.some((d) => d.type === "AudioPlayer.Play")).toBe(
      true,
    );
  });
});

describe("AudioIntentHandler", () => {
  const buildAudioInput = (intentName, adhanPlaybackMode) =>
    buildHandlerInput({
      intentName,
      sessionAttributes: {
        adhanPlaybackMode,
        adhanPlayerToken: "player-token-123",
      },
    });

  it("pauses the APL video component instead of stopping AudioPlayer when the custom player is active", async () => {
    const handlerInput = buildAudioInput("AMAZON.PauseIntent", "apl-video");

    const response = await AudioIntentHandler.handle(handlerInput);

    const executeCommands = response.directives.find(
      (d) => d.type === "Alexa.Presentation.APL.ExecuteCommands",
    );
    expect(executeCommands).toBeDefined();
    // Must target the token from the currently rendered document, not a
    // fresh one, or the runtime has no document to apply the commands to.
    expect(executeCommands.token).toBe("player-token-123");
    expect(executeCommands.commands).toContainEqual(
      expect.objectContaining({ type: "ControlMedia", command: "pause" }),
    );
    expect(response.directives.some((d) => d.type === "AudioPlayer.Stop")).toBe(
      false,
    );
  });

  it("resumes the APL video component when the custom player is active", async () => {
    const handlerInput = buildAudioInput("AMAZON.ResumeIntent", "apl-video");

    const response = await AudioIntentHandler.handle(handlerInput);

    const executeCommands = response.directives.find(
      (d) => d.type === "Alexa.Presentation.APL.ExecuteCommands",
    );
    expect(executeCommands.commands).toContainEqual(
      expect.objectContaining({ type: "ControlMedia", command: "play" }),
    );
  });

  it("keeps stopping the AudioPlayer directive when the legacy audio-player mode is active", async () => {
    const handlerInput = buildAudioInput("AMAZON.PauseIntent", "audio-player");

    const response = await AudioIntentHandler.handle(handlerInput);

    expect(response.directives).toContainEqual(
      expect.objectContaining({ type: "AudioPlayer.Stop" }),
    );
    expect(
      response.directives.some(
        (d) => d.type === "Alexa.Presentation.APL.ExecuteCommands",
      ),
    ).toBe(false);
  });
});

describe("getAdhanStopResponse", () => {
  // This is CancelAndStopIntentHandler's adhan-specific half, pulled out of
  // index.js (which exports nothing but `handler`) so it can be tested
  // directly rather than only through a full skill invocation.
  const SPEAK_OUTPUT = "Goodbye";

  it("stops the APL video component and clears session state", () => {
    const handlerInput = buildHandlerInput({
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "player-token-123",
      },
    });

    const response = getAdhanStopResponse(handlerInput, SPEAK_OUTPUT);

    expect(response).not.toBeNull();
    expect(spokenText(response)).toBe(SPEAK_OUTPUT);
    const executeCommands = response.directives.find(
      (d) => d.type === "Alexa.Presentation.APL.ExecuteCommands",
    );
    expect(executeCommands.token).toBe("player-token-123");
    expect(executeCommands.commands).toContainEqual(
      expect.objectContaining({ type: "ControlMedia", command: "pause" }),
    );
    // Hides the screen the same way the natural end of the Adhan does.
    expect(executeCommands.commands).toContainEqual(
      expect.objectContaining({ property: "hasEnded", value: true }),
    );
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBeUndefined();
    expect(sessionAttributes.adhanPlayerToken).toBeUndefined();
  });

  it("stops the AudioPlayer directive when context.AudioPlayer.playerActivity shows it's actually playing", () => {
    const handlerInput = buildHandlerInput({ sessionAttributes: {} });
    handlerInput.requestEnvelope.context.AudioPlayer = {
      playerActivity: "PLAYING",
    };

    const response = getAdhanStopResponse(handlerInput, SPEAK_OUTPUT);

    expect(response).not.toBeNull();
    expect(response.directives).toContainEqual(
      expect.objectContaining({ type: "AudioPlayer.Stop" }),
    );
  });

  it("also stops when playerActivity is PAUSED, not just PLAYING", () => {
    const handlerInput = buildHandlerInput({ sessionAttributes: {} });
    handlerInput.requestEnvelope.context.AudioPlayer = {
      playerActivity: "PAUSED",
    };

    const response = getAdhanStopResponse(handlerInput, SPEAK_OUTPUT);

    expect(response.directives).toContainEqual(
      expect.objectContaining({ type: "AudioPlayer.Stop" }),
    );
  });

  it("returns null when the adhan isn't playing in either mode, so the caller falls through to its generic response", () => {
    const handlerInput = buildHandlerInput({ sessionAttributes: {} });

    expect(getAdhanStopResponse(handlerInput, SPEAK_OUTPUT)).toBeNull();
  });
});

describe("AdhanPlaybackFinishedEventHandler", () => {
  const buildFinishedEventInput = ({ eventToken, sessionAttributes }) => {
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      sessionAttributes,
    });
    handlerInput.requestEnvelope.request.arguments = [
      "ADHAN_PLAYBACK_FINISHED",
    ];
    handlerInput.requestEnvelope.request.token = eventToken;
    return handlerInput;
  };

  it("clears adhanPlaybackMode/adhanPlayerToken when the event's token matches the active player", async () => {
    const handlerInput = buildFinishedEventInput({
      eventToken: "player-token-123",
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "player-token-123",
      },
    });

    await AdhanPlaybackFinishedEventHandler.handle(handlerInput);

    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBeUndefined();
    expect(sessionAttributes.adhanPlayerToken).toBeUndefined();
  });

  it("ignores a stale event whose token doesn't match a still-active player", async () => {
    // A later render (e.g. mosque info mid-adhan) issued a new token; this
    // event is from the document that render replaced and must not wipe
    // state for whatever is actually on screen now.
    const handlerInput = buildFinishedEventInput({
      eventToken: "old-superseded-token",
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "current-token",
      },
    });

    await AdhanPlaybackFinishedEventHandler.handle(handlerInput);

    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBe("apl-video");
    expect(sessionAttributes.adhanPlayerToken).toBe("current-token");
  });
});

describe("AdhanPlaybackFailedEventHandler", () => {
  it("clears session state and speaks the adhan error prompt", async () => {
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.Presentation.APL.UserEvent",
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "player-token-123",
      },
    });
    handlerInput.requestEnvelope.request.arguments = ["ADHAN_PLAYBACK_FAILED"];
    handlerInput.requestEnvelope.request.token = "player-token-123";

    const response = await AdhanPlaybackFailedEventHandler.handle(handlerInput);

    expect(spokenText(response)).toContain("playing the adhan isn't available");
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBeUndefined();
  });
});

describe("AddDirectiveResponseInterceptor — stale adhan state cleanup", () => {
  const OTHER_APL_DOC = { type: "APL", mainTemplate: {} };

  it("clears adhanPlaybackMode/adhanPlayerToken when a different APL document is rendered mid-adhan", async () => {
    const handlerInput = buildHandlerInput({
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "player-token-123",
      },
      supportedInterfaces: { "Alexa.Presentation.APL": {} },
    });
    const response = {
      directives: [
        {
          type: "Alexa.Presentation.APL.RenderDocument",
          token: "new-token",
          document: OTHER_APL_DOC,
          datasources: {},
        },
      ],
    };

    await AddDirectiveResponseInterceptor.process(handlerInput, response);

    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBeUndefined();
    expect(sessionAttributes.adhanPlayerToken).toBeUndefined();
  });

  it("leaves state untouched when the adhan player document itself is being rendered", async () => {
    const handlerInput = buildHandlerInput({
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "player-token-123",
      },
      supportedInterfaces: { "Alexa.Presentation.APL": {} },
    });
    const response = {
      directives: [
        {
          type: "Alexa.Presentation.APL.RenderDocument",
          token: "player-token-123",
          document: adhanPlayerApl,
          datasources: {},
        },
      ],
    };

    await AddDirectiveResponseInterceptor.process(handlerInput, response);

    expect(
      handlerInput.attributesManager.getSessionAttributes().adhanPlaybackMode,
    ).toBe("apl-video");
  });

  it("leaves state untouched for an ExecuteCommands directive targeting the adhan player (legitimate pause/resume)", async () => {
    // ExecuteCommands has no `document` field — this is the case the
    // cleanup must not mistake for a document swap, or every voice
    // pause/resume would wipe its own state on the very directive it sends.
    const handlerInput = buildHandlerInput({
      sessionAttributes: {
        adhanPlaybackMode: "apl-video",
        adhanPlayerToken: "player-token-123",
      },
      supportedInterfaces: { "Alexa.Presentation.APL": {} },
    });
    const response = {
      directives: [
        {
          type: "Alexa.Presentation.APL.ExecuteCommands",
          token: "player-token-123",
          commands: [],
        },
      ],
    };

    await AddDirectiveResponseInterceptor.process(handlerInput, response);

    expect(
      handlerInput.attributesManager.getSessionAttributes().adhanPlaybackMode,
    ).toBe("apl-video");
  });
});
