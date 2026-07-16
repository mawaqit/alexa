/**
 * Core selection logic: which prayer does the skill announce, and how far away
 * does it say it is. Every case here is a way the user could be told the wrong
 * prayer or a negative/absurd countdown in production.
 */
jest.mock("../handlers/apiHandler.js");

const { getPrayerTimings } = require("../handlers/apiHandler.js");
const {
  getNextPrayerTime,
  extractPhonemeText,
} = require("../helperFunctions.js");
const { createTranslate } = require("./support/i18n");
const {
  TODAY_TIMES,
  TOMORROW_TIMINGS,
  buildCalendar,
  freezeAt,
} = require("./support/fixtures");

const TIMEZONE = "Europe/Paris";
const MOSQUE_UUID = "mosque-uuid";

const t = createTranslate("en-US");
const PRAYER_NAMES = t("prayerNames");

/** "<sub alias='fajer'>Fajr</sub>" -> "Fajr" */
const plainName = (name) => extractPhonemeText([name])[0];

const nextPrayer = (options = {}) =>
  getNextPrayerTime(
    { t },
    options.times || TODAY_TIMES,
    TIMEZONE,
    PRAYER_NAMES,
    options.iqamaTime || [],
    options.mosqueUuid,
  );

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("getNextPrayerTime — adhan times", () => {
  it("announces the next upcoming prayer, not one that already passed", async () => {
    freezeAt("2026-07-16 13:00", TIMEZONE);

    const result = await nextPrayer();

    expect(plainName(result.name)).toBe("Dhuhr");
    expect(result.time).toBe("13:45");
    expect(result.diffInMinutes).toBe(45);
  });

  it("still announces the prayer at the exact minute of its adhan", async () => {
    // Boundary: at 13:45:00 the user asking "next prayer" must hear Dhuhr, not
    // be skipped ahead to Asr.
    freezeAt("2026-07-16 13:45", TIMEZONE);

    const result = await nextPrayer();

    expect(plainName(result.name)).toBe("Dhuhr");
    expect(result.diffInMinutes).toBe(0);
  });

  it("skips to Isha once Maghrib has passed by a single minute", async () => {
    freezeAt("2026-07-16 21:36", TIMEZONE);

    const result = await nextPrayer();

    expect(plainName(result.name)).toBe("Isha");
    expect(result.time).toBe("23:05");
  });
});

describe("getNextPrayerTime — after the last prayer of the day", () => {
  it("rolls over to tomorrow's Fajr using tomorrow's actual calendar time", async () => {
    // Isha (23:05) has passed. Tomorrow's Fajr is 05:31, one minute later than
    // today's 05:30 — announcing today's time would be wrong.
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({ "2026-07-17": TOMORROW_TIMINGS }),
    });

    const result = await nextPrayer({ mosqueUuid: MOSQUE_UUID });

    expect(plainName(result.name)).toBe("Fajr");
    expect(result.time).toBe("05:31");
    // 23:30 -> 05:31 next day = 6h01
    expect(result.diffInMinutes).toBe(361);
    expect(result.diffInMinutesPrompt).toBe("6 hours and 1 minutes");
  });

  it("never reports a negative countdown when the calendar is unavailable", async () => {
    // The rollover must still date Fajr to tomorrow, otherwise the user hears a
    // prayer that is 355 minutes in the past.
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockRejectedValue(new Error("MAWAQIT API down"));

    const result = await nextPrayer({ mosqueUuid: MOSQUE_UUID });

    expect(plainName(result.name)).toBe("Fajr");
    expect(result.time).toBe("05:30");
    expect(result.diffInMinutes).toBe(360);
  });

  it("falls back to today's Fajr time for tomorrow when no mosque uuid is known", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);

    const result = await nextPrayer();

    expect(getPrayerTimings).not.toHaveBeenCalled();
    expect(plainName(result.name)).toBe("Fajr");
    expect(result.time).toBe("05:30");
    expect(result.diffInMinutes).toBe(360);
  });

  it("rolls over across a month boundary", async () => {
    // Dec 31 23:30 -> Jan 1: the calendar lookup must land on month index 0 of
    // the *next* year's calendar slot, not read past the end of December.
    freezeAt("2026-12-31 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-01-01": ["06:12", "08:20", "12:50", "14:30", "17:05", "18:40"],
      }),
    });

    const result = await nextPrayer({
      times: ["06:11", "12:49", "14:29", "17:04", "18:39"],
      mosqueUuid: MOSQUE_UUID,
    });

    expect(plainName(result.name)).toBe("Fajr");
    expect(result.time).toBe("06:12");
    expect(result.diffInMinutes).toBeGreaterThan(0);
  });
});

describe("getNextPrayerTime — iqama times", () => {
  // Offsets in minutes after the adhan, as MAWAQIT returns them.
  const IQAMA_OFFSETS = ["10", "10", "5", "5", "10"];

  it("keeps announcing the current prayer between its adhan and its iqama", async () => {
    // 13:50 is after Dhuhr's adhan (13:45) but before its iqama (13:55).
    // Jumping to Asr here would send the user to the mosque an hour early.
    freezeAt("2026-07-16 13:50", TIMEZONE);

    const result = await nextPrayer({ iqamaTime: IQAMA_OFFSETS });

    expect(plainName(result.name)).toBe("Dhuhr");
    expect(result.time).toBe("13:55");
    expect(result.diffInMinutes).toBe(5);
  });

  it("moves on to the next prayer once the iqama itself has passed", async () => {
    freezeAt("2026-07-16 13:56", TIMEZONE);

    const result = await nextPrayer({ iqamaTime: IQAMA_OFFSETS });

    expect(plainName(result.name)).toBe("Asr");
    expect(result.time).toBe("17:55");
  });

  it("honours absolute iqama times instead of treating them as offsets", async () => {
    // A "14:15" entry means 14:15 sharp; parseInt would silently turn it into
    // "+14 minutes" and announce 13:59.
    freezeAt("2026-07-16 13:00", TIMEZONE);

    const result = await nextPrayer({
      iqamaTime: ["05:40", "14:15", "17:55", "21:45", "23:15"],
    });

    expect(plainName(result.name)).toBe("Dhuhr");
    expect(result.time).toBe("14:15");
  });

  it("rolls over to tomorrow's first iqama from the iqama calendar", async () => {
    // Isha's iqama (23:15) has passed. Tomorrow's Fajr iqama is an absolute
    // 05:45, which is neither today's iqama nor an offset of today's Fajr.
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockImplementation(
      async (_uuid, _tz, isIqamaCalendarRequired) =>
        isIqamaCalendarRequired
          ? {
              iqamaCalendar: buildCalendar({
                "2026-07-17": ["05:45", "14:00", "18:00", "21:45", "23:20"],
              }),
            }
          : { calendar: buildCalendar({ "2026-07-17": TOMORROW_TIMINGS }) },
    );

    const result = await nextPrayer({
      iqamaTime: IQAMA_OFFSETS,
      mosqueUuid: MOSQUE_UUID,
    });

    expect(plainName(result.name)).toBe("Fajr");
    expect(result.time).toBe("05:45");
    expect(result.diffInMinutes).toBe(375);
  });

  it("applies tomorrow's iqama offset to tomorrow's Fajr, not today's", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockImplementation(
      async (_uuid, _tz, isIqamaCalendarRequired) =>
        isIqamaCalendarRequired
          ? {
              iqamaCalendar: buildCalendar({
                "2026-07-17": ["15", "10", "5", "5", "10"],
              }),
            }
          : { calendar: buildCalendar({ "2026-07-17": TOMORROW_TIMINGS }) },
    );

    const result = await nextPrayer({
      iqamaTime: IQAMA_OFFSETS,
      mosqueUuid: MOSQUE_UUID,
    });

    // Tomorrow's Fajr 05:31 + 15 min offset.
    expect(result.time).toBe("05:46");
  });
});
