/**
 * One describe per user utterance. For each: the bug the user must not hit,
 * then the test that guarantees they don't.
 *
 * Only the network edge (MAWAQIT API) and the device services are doubled — the
 * handlers, helpers, response builder and prompt files are the real ones, so
 * these assert on the sentence Alexa actually speaks.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/dynamoDbHandler.js");

const { getPrayerTimings } = require("../handlers/apiHandler.js");
const {
  NextPrayerTimeIntentWithoutNameHandler,
  AllPrayerTimeIntentHandler,
  NextIqamaTimeIntentHandler,
  AllIqamaTimeIntentHandler,
} = require("../handlers/intentHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const {
  TODAY_TIMES,
  TOMORROW_TIMINGS,
  buildCalendar,
  freezeAt,
} = require("./support/fixtures");

const TZ = "Europe/Paris";
const UUID = "mosque-uuid";

// Realistic offsets in minutes after each adhan.
const IQAMA_OFFSETS = ["10", "10", "5", "5", "10"];

const buildInput = ({ intentName, mosqueTimes = {}, noMosque = false } = {}) =>
  buildHandlerInput({
    intentName,
    timezone: TZ,
    sessionAttributes: noMosque
      ? {}
      : {
          persistentAttributes: { uuid: UUID, primaryText: "Mosquée de Paris" },
          mosqueTimes: {
            times: TODAY_TIMES,
            shuruq: "06:45",
            iqamaEnabled: true,
            ...mosqueTimes,
          },
        },
  });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('"Alexa, when is the next prayer?"', () => {
  const build = (mosqueTimes) =>
    buildInput({ intentName: "NextPrayerTimeIntent", mosqueTimes });

  it("takes the utterance only when no prayer was named", () => {
    // Otherwise it would race NextPrayerTimeIntentHandler and answer a generic
    // "next prayer" to someone who explicitly asked for Asr.
    expect(
      NextPrayerTimeIntentWithoutNameHandler.canHandle(build()),
    ).toBeTruthy();

    const named = buildHandlerInput({
      intentName: "NextPrayerTimeIntent",
      slots: { prayerName: { name: "prayerName", value: "Asr" } },
    });
    expect(NextPrayerTimeIntentWithoutNameHandler.canHandle(named)).toBeFalsy();
  });

  it("speaks the name, the time and the countdown in that order", async () => {
    // The prompt interpolates three values positionally. Swap any two and the
    // user hears "the next prayer is Dhuhr at 45 minutes, in 1:45 PM".
    freezeAt("2026-07-16 13:00", TZ);

    const response =
      await NextPrayerTimeIntentWithoutNameHandler.handle(build());

    expect(spokenText(response)).toContain(
      "The next prayer is Dhuhr at 1:45 PM, in 45 minutes.",
    );
    expect(response.shouldEndSession).toBe(false);
  });

  it("rolls over to tomorrow's Fajr with tomorrow's time once Isha has passed", async () => {
    freezeAt("2026-07-16 23:30", TZ);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({ "2026-07-17": TOMORROW_TIMINGS }),
    });

    const response =
      await NextPrayerTimeIntentWithoutNameHandler.handle(build());
    const speech = spokenText(response);

    expect(speech).toContain("Fajr");
    expect(speech).toContain("5:31 AM"); // tomorrow's, not today's 5:30
    expect(speech).toContain("6 hours and 1 minutes");
  });

  it("asks the user to register a mosque instead of failing", async () => {
    freezeAt("2026-07-16 13:00", TZ);
    const handlerInput = buildInput({
      intentName: "NextPrayerTimeIntent",
      noMosque: true,
    });

    const response =
      await NextPrayerTimeIntentWithoutNameHandler.handle(handlerInput);

    expect(spokenText(response)).toContain("haven't registered a mosque");
  });

  it("blames the timezone, not the prayer times, when the device lookup fails", async () => {
    freezeAt("2026-07-16 13:00", TZ);
    const handlerInput = build();
    handlerInput.serviceClientFactory.getUpsServiceClient = () => ({
      getSystemTimeZone: async () => {
        throw new Error("ServiceError");
      },
    });

    const response =
      await NextPrayerTimeIntentWithoutNameHandler.handle(handlerInput);

    expect(spokenText(response)).toMatch(/time zone|timezone/i);
  });
});

describe('"Alexa, what are all the prayer times?"', () => {
  const build = (mosqueTimes) =>
    buildInput({ intentName: "AllPrayerTimeIntent", mosqueTimes });

  it("pairs every prayer with its own time, in order", async () => {
    // The names array (8 entries) and the times array (5) are walked by a shared
    // index. Any drift pairs "Asr" with Maghrib's 21:35.
    freezeAt("2026-07-16 04:00", TZ);

    const response = await AllPrayerTimeIntentHandler.handle(build());
    const speech = spokenText(response);

    expect(speech).toContain("Fajr is at 5:30 AM");
    expect(speech).toContain("Dhuhr is at 1:45 PM");
    expect(speech).toContain("Asr is at 5:50 PM");
    expect(speech).toContain("Maghrib is at 9:35 PM");
    expect(speech).toContain("Isha is at 11:05 PM");
  });

  it("still lists prayers that already passed — this is today's timetable", async () => {
    // Asked at 23:00, Fajr is long gone but must still be read out; this is not
    // the "next prayer" question.
    freezeAt("2026-07-16 23:00", TZ);

    const response = await AllPrayerTimeIntentHandler.handle(build());

    expect(spokenText(response)).toContain("Fajr is at 5:30 AM");
  });

  it("does not announce Jumua, Eid or Shuruq, which have no slot in `times`", async () => {
    // prayerNames carries 8 entries; only the first five are daily prayers.
    freezeAt("2026-07-16 04:00", TZ);

    const speech = spokenText(await AllPrayerTimeIntentHandler.handle(build()));

    expect(speech).not.toContain("Jumma");
    expect(speech).not.toContain("Eid");
    expect(speech).not.toContain("Shuruq");
  });

  it("skips a prayer the mosque left blank without shifting the others", async () => {
    // A null Dhuhr must drop Dhuhr only — Asr must keep 17:50, not inherit it.
    freezeAt("2026-07-16 04:00", TZ);

    const response = await AllPrayerTimeIntentHandler.handle(
      build({ times: ["05:30", null, "17:50", "21:35", "23:05"] }),
    );
    const speech = spokenText(response);

    expect(speech).not.toContain("Dhuhr");
    expect(speech).toContain("Asr is at 5:50 PM");
    expect(speech).toContain("Fajr is at 5:30 AM");
  });

  it("asks the user to register a mosque instead of failing", async () => {
    freezeAt("2026-07-16 04:00", TZ);

    const response = await AllPrayerTimeIntentHandler.handle(
      buildInput({ intentName: "AllPrayerTimeIntent", noMosque: true }),
    );

    expect(spokenText(response)).toContain("haven't registered a mosque");
  });
});

describe('"Alexa, when is the next iqama?"', () => {
  const build = (mosqueTimes) =>
    buildInput({ intentName: "NextIqamaTimeIntent", mosqueTimes });

  const mockIqamaCalendar = (row) =>
    getPrayerTimings.mockResolvedValue({
      iqamaCalendar: buildCalendar(row ? { "2026-07-16": row } : {}),
    });

  it("announces the iqama, which is later than the adhan", async () => {
    // Dhuhr adhan 13:45, iqama +10 = 13:55. At 13:00 the answer is 55 minutes,
    // not the 45 that would mean the adhan was announced instead.
    freezeAt("2026-07-16 13:00", TZ);
    mockIqamaCalendar(IQAMA_OFFSETS);

    const response = await NextIqamaTimeIntentHandler.handle(build());
    const speech = spokenText(response);

    expect(speech).toContain("Dhuhr");
    expect(speech).toContain("55 minutes");
    expect(speech).not.toContain("45 minutes");
  });

  it("never passes the adhan off as the iqama when the calendar row is missing", async () => {
    // A gap in the iqama calendar must not silently degrade into adhan times:
    // the user would go to the mosque at the call to prayer believing it is the
    // iqama. Saying nothing is correct; saying the wrong thing is not.
    freezeAt("2026-07-16 13:00", TZ);
    mockIqamaCalendar(null);

    const speech = spokenText(await NextIqamaTimeIntentHandler.handle(build()));

    expect(speech).not.toContain("45 minutes"); // that is Dhuhr's adhan
    expect(speech).toMatch(/not provided|couldn't find|try again/i);
  });

  it("says so plainly when the mosque does not publish iqama times", async () => {
    freezeAt("2026-07-16 13:00", TZ);

    const response = await NextIqamaTimeIntentHandler.handle(
      build({ iqamaEnabled: false }),
    );

    expect(spokenText(response)).toContain("not provided by your mosque");
    expect(response.shouldEndSession).toBe(false);
  });

  it("apologises rather than guessing when the API is down", async () => {
    freezeAt("2026-07-16 13:00", TZ);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));

    const speech = spokenText(await NextIqamaTimeIntentHandler.handle(build()));

    expect(speech).toMatch(/couldn't find|try again/i);
  });
});

describe('"Alexa, what are all the iqama times?"', () => {
  const build = (mosqueTimes) =>
    buildInput({ intentName: "AllIqamaIntent", mosqueTimes });

  const mockIqamaCalendar = (row) =>
    getPrayerTimings.mockResolvedValue({
      iqamaCalendar: buildCalendar(row ? { "2026-07-16": row } : {}),
    });

  it("pairs every prayer with its own iqama, offset from its own adhan", async () => {
    // Each iqama is its prayer's adhan plus that prayer's offset. Reusing one
    // offset across prayers, or drifting the index, misreports the lot.
    freezeAt("2026-07-16 04:00", TZ);
    mockIqamaCalendar(IQAMA_OFFSETS);

    const speech = spokenText(await AllIqamaTimeIntentHandler.handle(build()));

    expect(speech).toContain("For Fajr, iqama is at 5:40 AM"); // 05:30 +10
    expect(speech).toContain("For Dhuhr, iqama is at 1:55 PM"); // 13:45 +10
    expect(speech).toContain("For Asr, iqama is at 5:55 PM"); // 17:50 +5
    expect(speech).toContain("For Maghrib, iqama is at 9:40 PM"); // 21:35 +5
    expect(speech).toContain("For Isha, iqama is at 11:15 PM"); // 23:05 +10
  });

  it("honours absolute iqama entries instead of adding them as minutes", async () => {
    freezeAt("2026-07-16 04:00", TZ);
    mockIqamaCalendar(["05:45", "14:15", "18:00", "21:45", "23:20"]);

    const speech = spokenText(await AllIqamaTimeIntentHandler.handle(build()));

    expect(speech).toContain("For Dhuhr, iqama is at 2:15 PM");
    expect(speech).not.toContain("1:59 PM"); // 13:45 + 14, the offset misreading
  });

  it("says so plainly when the mosque does not publish iqama times", async () => {
    freezeAt("2026-07-16 04:00", TZ);

    const response = await AllIqamaTimeIntentHandler.handle(
      build({ iqamaEnabled: false }),
    );

    expect(spokenText(response)).toContain("not provided by your mosque");
  });

  it("does not read out a half-empty list when the calendar row is missing", async () => {
    freezeAt("2026-07-16 04:00", TZ);
    mockIqamaCalendar(null);

    const speech = spokenText(await AllIqamaTimeIntentHandler.handle(build()));

    expect(speech).not.toContain("iqama is at");
    expect(speech).toMatch(/not provided|couldn't find|try again/i);
  });
});
