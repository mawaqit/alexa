/**
 * The prayer board is the contract between the skill and mosqueInfoApl.json.
 * The document addresses prayers by id (`prayers.fajr`, `prayers.jumua`…), so a
 * renamed key or a missing entry silently blanks a whole column on the device.
 */
jest.mock("../handlers/apiHandler.js");

const {
  buildPrayerBoard,
  getNextDailyPrayerId,
} = require("../helperFunctions.js");
const { createTranslate } = require("./support/i18n");

const TIMES = ["05:23", "13:45", "18:10", "20:19", "22:12"];

const build = (overrides = {}) =>
  buildPrayerBoard({
    requestAttributes: { t: createTranslate("en-US") },
    locale: "en-US",
    times: TIMES,
    shuruq: "07:30",
    jumuaTimes: ["13:00", "14:30", null],
    timezone: "Europe/Paris",
    ...overrides,
  });

describe("buildPrayerBoard", () => {
  it("exposes every prayer under the id the APL document asks for", () => {
    const board = build();
    expect(Object.keys(board)).toEqual([
      "fajr",
      "dhuhr",
      "asr",
      "maghrib",
      "isha",
      "shuruq",
      "jumua",
      "jumua2",
      "jumua3",
    ]);
  });

  it("strips the SSML aliases from the displayed prayer names", () => {
    const board = build();
    expect(board.fajr.name).toBe("Fajr");
    expect(board.shuruq.name).toBe("Shuruq");
    // Extra Friday slots are numbered off the same translated name.
    expect(board.jumua2.name).toBe("Jumma 2");
  });

  it("formats times for the locale while keeping the raw value for logic", () => {
    const board = build();
    expect(board.fajr.time).toBe("05:23");
    // Intl inserts a narrow no-break space before the meridiem in en-US.
    expect(board.fajr.timeLabel.replace(/[\u202f\u00a0]/g, " ")).toBe(
      "5:23 AM",
    );
  });

  it("keeps a stable shape when the mosque provides no Friday or sunrise time", () => {
    const board = build({ shuruq: null, jumuaTimes: [] });
    expect(board.shuruq).toBeNull();
    expect(board.jumua2).toBeNull();
    // Jumu'a always renders so the panel doesn't collapse; it just reads "None".
    expect(board.jumua.time).toBeNull();
    expect(board.jumua.timeLabel).toBe("None");
  });

  it("flags exactly one upcoming prayer", () => {
    const board = build();
    const flagged = Object.values(board).filter(
      (prayer) => prayer && prayer.isNext,
    );
    expect(flagged).toHaveLength(1);
  });
});

describe("getNextDailyPrayerId", () => {
  const atLocalTime = (isoTime) => {
    jest.useFakeTimers().setSystemTime(new Date(`2026-07-22T${isoTime}Z`));
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it("picks the first prayer still to come", () => {
    atLocalTime("12:00:00");
    expect(getNextDailyPrayerId(TIMES, "UTC")).toBe("dhuhr");
  });

  it("treats a prayer starting right now as the next one", () => {
    atLocalTime("13:45:00");
    expect(getNextDailyPrayerId(TIMES, "UTC")).toBe("dhuhr");
  });

  it("wraps to tomorrow's Fajr once Isha has passed", () => {
    atLocalTime("23:30:00");
    expect(getNextDailyPrayerId(TIMES, "UTC")).toBe("fajr");
  });

  it("reads the clock in the mosque's timezone, not the server's", () => {
    // 23:30 UTC is 01:30 the next day in Paris, so Fajr is still ahead there.
    atLocalTime("23:30:00");
    expect(getNextDailyPrayerId(TIMES, "Europe/Paris")).toBe("fajr");
    // 06:00 UTC is 08:00 in Paris — Fajr has passed, Dhuhr is next.
    atLocalTime("06:00:00");
    expect(getNextDailyPrayerId(TIMES, "Europe/Paris")).toBe("dhuhr");
  });
});
