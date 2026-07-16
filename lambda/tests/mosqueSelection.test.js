/**
 * Flow: Alexa reads out the nearby mosques ("1. …, 2. …") and the user says a
 * number.
 *
 * This is upstream of every prayer time the skill will ever speak, and the
 * choice is persisted: pick the wrong mosque and the user gets correct maths on
 * the wrong data, for good, with nothing in the wording to hint at it. The
 * spoken list is 1-based and the array is 0-based, which is where it would go.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/dynamoDbHandler.js");
jest.mock("../handlers/googleTranslateHandler.js");

const { getPrayerTimings } = require("../handlers/apiHandler.js");
const { detectLanguage } = require("../handlers/googleTranslateHandler.js");
const {
  SelectMosqueIntentAfterSelectingMosqueHandler,
  SelectMosqueIntentStartedHandler,
} = require("../handlers/intentHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const { TODAY_TIMES, freezeAt } = require("./support/fixtures");

const TZ = "Europe/Paris";

// As read out to the user: "1. Grande Mosquée, 2. Masjid An-Nour, ..."
const MOSQUE_LIST = [
  { primaryText: "Grande Mosquée", uuid: "uuid-1", proximity: "1200" },
  { primaryText: "Masjid An-Nour", uuid: "uuid-2", proximity: "2400" },
  { primaryText: "Mosquée Al-Fath", uuid: "uuid-3", proximity: "3600" },
  { primaryText: "Centre Islamique", uuid: "uuid-4", proximity: "4800" },
  { primaryText: "Masjid As-Salam", uuid: "uuid-5", proximity: "6000" },
];

const buildInput = ({ said, mosqueList = MOSQUE_LIST } = {}) =>
  buildHandlerInput({
    intentName: "SelectMosqueIntent",
    timezone: TZ,
    slots:
      said === undefined
        ? {}
        : { selectedMosque: { name: "selectedMosque", value: said } },
    sessionAttributes: mosqueList ? { mosqueList: [...mosqueList] } : {},
  });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
  freezeAt("2026-07-16 13:00", TZ);
  // Names are already in the target language; keep the translator out of it.
  detectLanguage.mockResolvedValue("fr");
  getPrayerTimings.mockResolvedValue({ times: TODAY_TIMES, shuruq: "06:45" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("routing", () => {
  it("waits for a number before trying to resolve a mosque", () => {
    expect(
      SelectMosqueIntentAfterSelectingMosqueHandler.canHandle(
        buildInput({ said: "2" }),
      ),
    ).toBeTruthy();
    expect(
      SelectMosqueIntentAfterSelectingMosqueHandler.canHandle(buildInput({})),
    ).toBeFalsy();
    expect(
      SelectMosqueIntentStartedHandler.canHandle(buildInput({})),
    ).toBeTruthy();
  });
});

describe("the number the user says selects that exact mosque", () => {
  it.each([
    ["1", "uuid-1", "Grande Mosquée"],
    ["2", "uuid-2", "Masjid An-Nour"],
    ["3", "uuid-3", "Mosquée Al-Fath"],
    ["5", "uuid-5", "Masjid As-Salam"],
  ])(
    'saying "%s" fetches the times of %s and names it back',
    async (said, expectedUuid, expectedName) => {
      // The spoken list is 1-based, the array 0-based. An off-by-one here is
      // invisible to the user — they simply get a neighbouring mosque's times
      // from then on.
      const handlerInput = buildInput({ said });

      const response =
        await SelectMosqueIntentAfterSelectingMosqueHandler.handle(
          handlerInput,
        );

      expect(getPrayerTimings).toHaveBeenCalledWith(expectedUuid, TZ);
      expect(spokenText(response)).toContain(expectedName);
    },
  );

  it("persists the chosen mosque so later sessions keep using it", async () => {
    const handlerInput = buildInput({ said: "2" });

    await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    expect(handlerInput._getPersistentAttributes()).toMatchObject({
      uuid: "uuid-2",
      primaryText: "Masjid An-Nour",
    });
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();
  });

  it("stores the distance as a number of metres for later localization", async () => {
    // The API returns proximity as a string; the mosque-info prompt formats it
    // with Intl, which needs a real number.
    const handlerInput = buildInput({ said: "2" });

    await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    expect(handlerInput._getPersistentAttributes().proximity).toBe(2400);
  });
});

describe("a number that does not match a mosque", () => {
  it.each([["0"], ["6"], ["99"], ["-1"]])(
    'saying "%s" re-offers the list instead of picking one',
    async (said) => {
      // Anything outside 1..5 must not resolve. Silently landing on a mosque
      // here is worse than asking again.
      const handlerInput = buildInput({ said });

      const response =
        await SelectMosqueIntentAfterSelectingMosqueHandler.handle(
          handlerInput,
        );

      expect(getPrayerTimings).not.toHaveBeenCalled();
      expect(handlerInput._savePersistentAttributes).not.toHaveBeenCalled();
      expect(spokenText(response)).toContain("couldn't find the mosque");
    },
  );

  it("re-offers the list when the utterance is not a number at all", async () => {
    const handlerInput = buildInput({ said: "the first one" });

    const response =
      await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    expect(getPrayerTimings).not.toHaveBeenCalled();
    expect(spokenText(response)).toContain("couldn't find the mosque");
  });
});

describe("the list is not in the session", () => {
  it("answers instead of crashing when no list was ever read out", async () => {
    // Alexa routes this intent on the utterance alone, so a bare "two" can
    // arrive with nothing to index into — as can a recycled session. This used
    // to throw a TypeError before the handler's own try block.
    const handlerInput = buildInput({ said: "2", mosqueList: null });

    // Throwing here is the regression: it escapes the handler's try block and
    // the user gets the global "I didn't quite catch that" instead of help.
    const response =
      await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    expect(response.outputSpeech.ssml).toBeTruthy();
    expect(getPrayerTimings).not.toHaveBeenCalled();
    expect(handlerInput._savePersistentAttributes).not.toHaveBeenCalled();
  });

  it("does not persist a mosque it could not resolve", async () => {
    const handlerInput = buildInput({ said: "2", mosqueList: [] });

    await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    expect(getPrayerTimings).not.toHaveBeenCalled();
    expect(handlerInput._savePersistentAttributes).not.toHaveBeenCalled();
  });
});

describe("the mosque resolves but its times do not", () => {
  it("starts the mosque search again when MAWAQIT no longer knows the mosque", async () => {
    // A mosque that has left MAWAQIT must send the user back into picking one,
    // not end the session on a generic error.
    getPrayerTimings.mockRejectedValue(new Error("Mosque not found"));
    const handlerInput = buildInput({ said: "2" });

    const response =
      await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    // No geolocation on this device, so re-searching means asking for the
    // location permission rather than dead-ending.
    expect(spokenText(response)).toContain("need access to your location");
  });

  it("blames the timezone when the device lookup fails", async () => {
    const handlerInput = buildInput({ said: "2" });
    handlerInput.serviceClientFactory.getUpsServiceClient = () => ({
      getSystemTimeZone: async () => {
        throw new Error("ServiceError");
      },
    });

    const response =
      await SelectMosqueIntentAfterSelectingMosqueHandler.handle(handlerInput);

    expect(spokenText(response)).toMatch(/time zone|timezone/i);
  });
});
