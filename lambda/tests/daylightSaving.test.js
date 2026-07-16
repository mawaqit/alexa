/**
 * Flow: the user asks for a prayer on one of the two nights a year the clocks
 * change.
 * Bug: the announced *time* is right, but the countdown is an hour off, because
 * the duration is computed on wall-clock strings and a DST jump is invisible to
 * them. "Fajr at 6:30, in 7 hours" when it is really 6 hours away.
 * Test: assert the countdown equals the real elapsed time, in both directions.
 *
 * Europe/Paris springs forward 2026-03-29 (02:00->03:00, an hour disappears)
 * and falls back 2026-10-25 (03:00->02:00, an hour repeats).
 */
jest.mock("../handlers/apiHandler.js");

const moment = require("moment-timezone");
const { getPrayerTimings } = require("../handlers/apiHandler.js");
const {
  getNextPrayerTime,
  getPrayerTimeForSpecificPrayer,
} = require("../helperFunctions.js");
const { createTranslate } = require("./support/i18n");
const { buildHandlerInput, spokenText } = require("./support/handlerInput");
const { freezeAt } = require("./support/fixtures");

const TZ = "Europe/Paris";
const t = createTranslate("en-US");
const PRAYER_NAMES = t("prayerNames");

/** Real minutes between two wall-clock instants in `TZ`, DST included. */
const realMinutesBetween = (from, to) =>
  moment
    .tz(to, "YYYY-MM-DD HH:mm", TZ)
    .diff(moment.tz(from, "YYYY-MM-DD HH:mm", TZ), "minutes");

const nextPrayer = (times) =>
  getNextPrayerTime({ t }, times, TZ, PRAYER_NAMES, [], null);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
  getPrayerTimings.mockRejectedValue(new Error("calendar not needed here"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("getNextPrayerTime — spring forward (an hour disappears)", () => {
  const TIMES = ["06:30", "13:45", "17:50", "21:35", "23:05"];

  it("counts the real hours to tomorrow's Fajr across the jump, not the wall-clock ones", async () => {
    // 23:30 on the 28th -> Fajr 06:30 on the 29th. Wall clock says 7h00, but
    // 02:00-03:00 never happens, so the user really waits 6h00.
    freezeAt("2026-03-28 23:30", TZ);
    expect(realMinutesBetween("2026-03-28 23:30", "2026-03-29 06:30")).toBe(
      360,
    );

    const result = await nextPrayer(TIMES);

    expect(result.time).toBe("06:30");
    expect(result.diffInMinutes).toBe(360);
    expect(result.diffInMinutesPrompt).toBe("6 hours and 0 minutes");
  });

  it("counts the real hours within the same day across the jump", async () => {
    // 01:30 -> 06:30 the same morning: wall clock 5h00, real 4h00. No rollover
    // involved, so this isolates the duration maths from the date maths.
    freezeAt("2026-03-29 01:30", TZ);
    expect(realMinutesBetween("2026-03-29 01:30", "2026-03-29 06:30")).toBe(
      240,
    );

    const result = await nextPrayer(TIMES);

    expect(result.time).toBe("06:30");
    expect(result.diffInMinutes).toBe(240);
    expect(result.diffInMinutesPrompt).toBe("4 hours and 0 minutes");
  });
});

describe("getNextPrayerTime — fall back (an hour repeats)", () => {
  const TIMES = ["06:30", "13:45", "17:50", "21:35", "23:05"];

  it("counts the real hours to tomorrow's Fajr across the repeated hour", async () => {
    // 23:30 on the 24th -> Fajr 06:30 on the 25th. Wall clock says 7h00, but
    // 02:00-03:00 happens twice, so the user really waits 8h00.
    freezeAt("2026-10-24 23:30", TZ);
    expect(realMinutesBetween("2026-10-24 23:30", "2026-10-25 06:30")).toBe(
      480,
    );

    const result = await nextPrayer(TIMES);

    expect(result.time).toBe("06:30");
    expect(result.diffInMinutes).toBe(480);
    expect(result.diffInMinutesPrompt).toBe("8 hours and 0 minutes");
  });
});

describe("getNextPrayerTime — an ordinary night must not regress", () => {
  it("keeps wall-clock and real time identical when no transition occurs", async () => {
    freezeAt("2026-07-16 23:30", TZ);

    const result = await nextPrayer([
      "05:30",
      "13:45",
      "17:50",
      "21:35",
      "23:05",
    ]);

    expect(result.diffInMinutes).toBe(360);
    expect(result.diffInMinutesPrompt).toBe("6 hours and 0 minutes");
  });
});

describe("getPrayerTimeForSpecificPrayer — 'when is Fajr?' on a DST night", () => {
  const buildInput = () =>
    buildHandlerInput({
      intentName: "NextPrayerTimeIntent",
      timezone: TZ,
      sessionAttributes: {
        persistentAttributes: { uuid: "mosque-uuid", primaryText: "Mosque" },
      },
    });

  it("announces the real countdown across the spring jump", async () => {
    freezeAt("2026-03-28 23:30", TZ);
    const handlerInput = buildInput();
    const now = moment(
      new Date(new Date().toLocaleString("en-US", { timeZone: TZ })),
    );

    const response = getPrayerTimeForSpecificPrayer(
      handlerInput,
      "06:30",
      moment(now.format("YYYY-MM-DDTHH:mm")),
      now,
      "Fajr",
      TZ,
    );
    const speech = spokenText(response);

    expect(speech).toContain("6:30 AM");
    expect(speech).toContain("6 hours and 0 minutes");
  });

  it("announces the real countdown across the autumn repeat", async () => {
    freezeAt("2026-10-24 23:30", TZ);
    const handlerInput = buildInput();
    const now = moment(
      new Date(new Date().toLocaleString("en-US", { timeZone: TZ })),
    );

    const response = getPrayerTimeForSpecificPrayer(
      handlerInput,
      "06:30",
      moment(now.format("YYYY-MM-DDTHH:mm")),
      now,
      "Fajr",
      TZ,
    );

    expect(spokenText(response)).toContain("8 hours and 0 minutes");
  });
});
