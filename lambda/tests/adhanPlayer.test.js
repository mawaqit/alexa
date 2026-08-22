// The Adhan player deliberately avoids Alexa's AudioPlayer interface on
// screen-capable devices: an AudioPlayer.Play directive makes Alexa show its
// own system Now-Playing card, which would immediately cover the custom
// MAWAQIT-styled player screen. These tests guard that fork — APL-capable
// devices must get the custom RenderDocument path and never an AudioPlayer
// directive, while audio-only devices must keep working exactly as before.
const { PlayAdhanIntentHandler } = require("../handlers/intentHandler.js");
const { AudioIntentHandler } = require("../handlers/audioPlayerHandler.js");
const { buildHandlerInput } = require("./support/handlerInput");

const buildPlayAdhanInput = (supportedInterfaces, viewport = {}) =>
  buildHandlerInput({
    intentName: "PlayAdhanIntent",
    sessionAttributes: {
      persistentAttributes: { uuid: "mosque-uuid" },
    },
    supportedInterfaces,
    viewport,
  });

const VIDEO_CAPABLE_VIEWPORT = { video: { codecs: ["H_264_42"] } };

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
    // pause/resume and the onEnd SendEvent's route back to the skill.
    expect(response.shouldEndSession).toBeUndefined();

    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    expect(sessionAttributes.adhanPlaybackMode).toBe("apl-video");
    // AudioIntentHandler needs this exact token to target the on-screen
    // document later.
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
    expect(
      handlerInput.attributesManager.getSessionAttributes().adhanPlaybackMode,
    ).toBe("audio-player");
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
    expect(
      handlerInput.attributesManager.getSessionAttributes().adhanPlaybackMode,
    ).toBe("audio-player");
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
