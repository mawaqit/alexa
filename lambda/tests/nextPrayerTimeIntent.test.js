/**
 * Integration: "Alexa, when is Asr?" from an Alexa IntentRequest all the way to
 * the spoken response. Only the network edge (MAWAQIT API) and the device
 * services are doubled; the intent handler, the helpers and the real prompts
 * run for real.
 */
jest.mock("../handlers/apiHandler.js");
jest.mock("../handlers/dynamoDbHandler.js");

const { getPrayerTimings } = require("../handlers/apiHandler.js");
const { NextPrayerTimeIntentHandler } = require("../handlers/intentHandler.js");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const {
  TODAY_TIMES,
  TOMORROW_TIMINGS,
  buildCalendar,
  freezeAt,
} = require("./support/fixtures");

const TIMEZONE = "Europe/Paris";
const MOSQUE_UUID = "mosque-uuid";

// Prayer slot ids come from the interaction model: 0=Fajr .. 4=Isha, 5=Jumua,
// 6=Eid, 7=Shuruq. They index directly into the `prayerNames` prompt array.
const prayerSlot = (id, spoken) => ({
  prayerName: {
    name: "prayerName",
    value: spoken,
    resolutions: {
      resolutionsPerAuthority: [
        {
          status: { code: "ER_SUCCESS_MATCH" },
          values: [{ value: { name: spoken, id: String(id) } }],
        },
      ],
    },
  },
});

const unresolvedPrayerSlot = (spoken) => ({
  prayerName: {
    name: "prayerName",
    value: spoken,
    resolutions: {
      resolutionsPerAuthority: [
        { status: { code: "ER_SUCCESS_NO_MATCH" }, values: [] },
      ],
    },
  },
});

const buildInput = (slots, mosqueTimes = {}) =>
  buildHandlerInput({
    intentName: "NextPrayerTimeIntent",
    slots,
    timezone: TIMEZONE,
    sessionAttributes: {
      persistentAttributes: {
        uuid: MOSQUE_UUID,
        primaryText: "Grande Mosquée de Paris",
      },
      mosqueTimes: {
        times: TODAY_TIMES,
        shuruq: "06:45",
        jumua: "13:15",
        jumua2: null,
        jumua3: null,
        aidPrayerTime: null,
        aidPrayerTime2: null,
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

describe("NextPrayerTimeIntentHandler — routing", () => {
  it("handles the intent only when a prayer name was spoken", () => {
    const withSlot = buildInput(prayerSlot(2, "Asr"));
    expect(NextPrayerTimeIntentHandler.canHandle(withSlot)).toBeTruthy();

    const withoutSlot = buildInput({});
    expect(NextPrayerTimeIntentHandler.canHandle(withoutSlot)).toBeFalsy();
  });
});

describe("NextPrayerTimeIntentHandler — naming the prayer the user asked for", () => {
  it.each([
    [0, "Fajr", "5:30 AM"],
    [1, "Dhuhr", "1:45 PM"],
    [2, "Asr", "5:50 PM"],
    [3, "Maghrib", "9:35 PM"],
    [4, "Isha", "11:05 PM"],
  ])(
    "answers slot id %i with %s's own time",
    async (id, name, expectedTime) => {
      // The slot id indexes both `prayerNames` and `mosqueTimes.times`. If those
      // ever drift apart the user hears e.g. "Asr is at 21:35" — Maghrib's time.
      freezeAt("2026-07-16 04:00", TIMEZONE);
      const handlerInput = buildInput(prayerSlot(id, name));

      const response = await NextPrayerTimeIntentHandler.handle(handlerInput);
      const speech = spokenText(response);

      expect(speech).toContain(name);
      expect(speech).toContain(expectedTime);
    },
  );

  it("asks again instead of guessing when the prayer name did not resolve", async () => {
    // No resolved id means Alexa did not recognise the word. Falling through to
    // parseInt(undefined) would index prayerNames[NaN] and speak "undefined".
    freezeAt("2026-07-16 12:00", TIMEZONE);
    const handlerInput = buildInput(unresolvedPrayerSlot("brunch"));

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);

    expect(spokenText(response)).toContain(
      "couldn't recognize the prayer name",
    );
    expect(response.shouldEndSession).toBe(false);
  });
});

describe("NextPrayerTimeIntentHandler — a prayer that already passed today", () => {
  it("announces tomorrow's actual time for that same prayer", async () => {
    // 14:00, user asks for Dhuhr (13:45, passed). Tomorrow's Dhuhr is 13:46.
    freezeAt("2026-07-16 14:00", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-07-17": ["05:31", "06:46", "13:46", "17:49", "21:34", "23:04"],
      }),
    });
    const handlerInput = buildInput(prayerSlot(1, "Dhuhr"));

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);
    const speech = spokenText(response);

    expect(speech).toContain("1:46 PM");
    expect(speech).not.toContain("1:45 PM");
    // ~23h47 away, and never a negative countdown.
    expect(speech).toContain("23 hours and 46 minutes");
  });

  it("does not reach for tomorrow's calendar when the prayer is still ahead", async () => {
    freezeAt("2026-07-16 12:00", TIMEZONE);
    const handlerInput = buildInput(prayerSlot(1, "Dhuhr"));

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);

    expect(getPrayerTimings).not.toHaveBeenCalled();
    expect(spokenText(response)).toContain("1:45 PM");
  });

  it("falls back to today's time for tomorrow when the calendar fetch fails", async () => {
    // Degraded, but the countdown must still be positive rather than announcing
    // a prayer 15 minutes in the past.
    freezeAt("2026-07-16 14:00", TIMEZONE);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));
    const handlerInput = buildInput(prayerSlot(1, "Dhuhr"));

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);
    const speech = spokenText(response);

    expect(speech).toContain("1:45 PM");
    expect(speech).toContain("23 hours and 45 minutes");
    expect(speech).not.toContain("-");
  });
});

describe("NextPrayerTimeIntentHandler — shuruq, jumua and eid", () => {
  it("uses tomorrow's shuruq once today's has passed", async () => {
    freezeAt("2026-07-16 12:00", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({ "2026-07-17": TOMORROW_TIMINGS }),
    });
    const handlerInput = buildInput(prayerSlot(7, "Shuruq"));

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);

    // Tomorrow's shuruq is the calendar's index 1 — 06:46, not today's 06:45.
    expect(spokenText(response)).toContain("6:46 AM");
  });

  it("lists every Jumua time the mosque publishes", async () => {
    freezeAt("2026-07-16 12:00", TIMEZONE);
    const handlerInput = buildInput(prayerSlot(5, "Jumma"), {
      jumua: "13:15",
      jumua2: "14:00",
    });

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);
    const speech = spokenText(response);

    expect(speech).toContain("1:15 PM");
    expect(speech).toContain("2:00 PM");
  });

  it("says there is no schedule rather than inventing an Eid time", async () => {
    freezeAt("2026-07-16 12:00", TIMEZONE);
    const handlerInput = buildInput(prayerSlot(6, "Eid"), {
      aidPrayerTime: null,
      aidPrayerTime2: null,
    });

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);

    expect(spokenText(response)).toContain("no schedule");
    expect(response.shouldEndSession).toBe(false);
  });
});

describe("NextPrayerTimeIntentHandler — failure modes", () => {
  it("prompts to register a mosque when none is stored", async () => {
    freezeAt("2026-07-16 12:00", TIMEZONE);
    const handlerInput = buildHandlerInput({
      intentName: "NextPrayerTimeIntent",
      slots: prayerSlot(2, "Asr"),
      sessionAttributes: {},
    });

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);

    expect(spokenText(response)).toContain("haven't registered a mosque");
  });

  it("apologises about the timezone when the device lookup fails", async () => {
    freezeAt("2026-07-16 12:00", TIMEZONE);
    const handlerInput = buildInput(prayerSlot(2, "Asr"));
    handlerInput.serviceClientFactory.getUpsServiceClient = () => ({
      getSystemTimeZone: jest.fn(async () => {
        throw new Error("ServiceError");
      }),
    });

    const response = await NextPrayerTimeIntentHandler.handle(handlerInput);

    expect(spokenText(response)).toMatch(/time zone|timezone/i);
    expect(response.shouldEndSession).toBe(true);
  });
});
