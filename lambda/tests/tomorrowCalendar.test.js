/**
 * `mosqueTimes.times` only ever holds today's timings. When a prayer has passed,
 * the skill must read tomorrow's row out of the calendar — prayer times drift
 * daily, so reusing today's time announces the wrong minute.
 */
jest.mock("../handlers/apiHandler.js");

const moment = require("moment-timezone");
const { getPrayerTimings } = require("../handlers/apiHandler.js");
const {
  getTomorrowPrayerTimes,
  getTomorrowIqamaTimes,
  hasPrayerTimePassed,
} = require("../helperFunctions.js");
const { buildCalendar, freezeAt } = require("./support/fixtures");

const MOSQUE_UUID = "mosque-uuid";
const TIMEZONE = "Europe/Paris";

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("getTomorrowPrayerTimes", () => {
  it("returns tomorrow's row with shuruq split out of the prayer indices", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-07-17": ["05:31", "06:46", "13:45", "17:49", "21:34", "23:04"],
      }),
    });

    const result = await getTomorrowPrayerTimes(MOSQUE_UUID, TIMEZONE);

    expect(result.times).toEqual(["05:31", "13:45", "17:49", "21:34", "23:04"]);
    expect(result.shuruq).toBe("06:46");
  });

  it("crosses into the next month's calendar slot", async () => {
    // July 31 -> August 1: month index must advance from 6 to 7, otherwise the
    // lookup misses and the caller silently keeps today's time.
    freezeAt("2026-07-31 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-08-01": ["06:05", "07:20", "13:47", "17:35", "21:10", "22:40"],
      }),
    });

    const result = await getTomorrowPrayerTimes(MOSQUE_UUID, TIMEZONE);

    expect(result.times[0]).toBe("06:05");
  });

  it("wraps December 31 onto the January slot", async () => {
    freezeAt("2026-12-31 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-01-01": ["06:12", "08:20", "12:50", "14:30", "17:05", "18:40"],
      }),
    });

    const result = await getTomorrowPrayerTimes(MOSQUE_UUID, TIMEZONE);

    expect(result.times[0]).toBe("06:12");
  });

  it("resolves 'tomorrow' in the mosque's timezone, not the Lambda's UTC day", async () => {
    // 2026-07-17 08:00 in Sydney is 2026-07-16 22:00 UTC. Tomorrow is the 18th
    // for the user; a UTC-based lookup would return the 17th — i.e. today.
    freezeAt("2026-07-17 08:00", "Australia/Sydney");
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-07-17": ["05:31", "06:46", "13:45", "17:49", "21:34", "23:04"],
        "2026-07-18": ["05:32", "06:47", "13:45", "17:48", "21:33", "23:03"],
      }),
    });

    const result = await getTomorrowPrayerTimes(
      MOSQUE_UUID,
      "Australia/Sydney",
    );

    expect(result.times[0]).toBe("05:32");
  });

  it("requests the prayer calendar explicitly", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      calendar: buildCalendar({
        "2026-07-17": ["05:31", "06:46", "13:45", "17:49", "21:34", "23:04"],
      }),
    });

    await getTomorrowPrayerTimes(MOSQUE_UUID, TIMEZONE);

    // 4th arg is `isPrayerCalendarRequired`; without it the API handler strips
    // the calendar from the response and the lookup always returns null.
    expect(getPrayerTimings).toHaveBeenCalledWith(
      MOSQUE_UUID,
      TIMEZONE,
      false,
      true,
    );
  });

  it("returns null when the calendar has no row for tomorrow", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({ calendar: buildCalendar({}) });

    await expect(
      getTomorrowPrayerTimes(MOSQUE_UUID, TIMEZONE),
    ).resolves.toBeNull();
  });

  it("returns null when the response carries no calendar at all", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({ times: ["05:30"] });

    await expect(
      getTomorrowPrayerTimes(MOSQUE_UUID, TIMEZONE),
    ).resolves.toBeNull();
  });
});

describe("getTomorrowIqamaTimes", () => {
  it("returns tomorrow's iqama row untouched (offsets are not times)", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      iqamaCalendar: buildCalendar({
        "2026-07-17": ["15", "10", "5", "5", "10"],
      }),
    });

    const result = await getTomorrowIqamaTimes(MOSQUE_UUID, TIMEZONE);

    // Unlike the prayer calendar there is no shuruq slot to strip here.
    expect(result).toEqual(["15", "10", "5", "5", "10"]);
  });

  it("requests the iqama calendar explicitly", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({
      iqamaCalendar: buildCalendar({ "2026-07-17": ["15"] }),
    });

    await getTomorrowIqamaTimes(MOSQUE_UUID, TIMEZONE);

    expect(getPrayerTimings).toHaveBeenCalledWith(MOSQUE_UUID, TIMEZONE, true);
  });

  it("returns null when the mosque publishes no iqama calendar", async () => {
    freezeAt("2026-07-16 23:30", TIMEZONE);
    getPrayerTimings.mockResolvedValue({ iqamaCalendar: [] });

    await expect(
      getTomorrowIqamaTimes(MOSQUE_UUID, TIMEZONE),
    ).resolves.toBeNull();
  });
});

describe("hasPrayerTimePassed", () => {
  const now = moment("2026-07-16T13:45");

  it("treats the exact minute of the adhan as not yet passed", () => {
    // Pairs with getNextPrayerTime's isSameOrAfter boundary: at 13:45 the user
    // must hear today's Dhuhr, not tomorrow's.
    expect(hasPrayerTimePassed("13:45", now)).toBe(false);
  });

  it("detects a prayer one minute in the past", () => {
    expect(hasPrayerTimePassed("13:44", now)).toBe(true);
  });

  it("detects a prayer later today", () => {
    expect(hasPrayerTimePassed("17:50", now)).toBe(false);
  });

  it("ignores the date carried by `now` and compares wall-clock only", () => {
    expect(hasPrayerTimePassed("05:30", moment("2026-12-31T13:45"))).toBe(true);
  });
});
