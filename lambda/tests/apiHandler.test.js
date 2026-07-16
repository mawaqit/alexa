/**
 * The API handler turns a raw MAWAQIT calendar into the `times` array the rest
 * of the skill trusts. Two things must not go wrong: picking the row for the
 * *user's* current day (not the Lambda's UTC day), and dropping shuruq so the
 * remaining indices still mean Fajr..Isha.
 */
jest.mock("axios");

const axios = require("axios");
const {
  getPrayerTimings,
  getMosqueList,
  getDateAndMonthForTimezone,
} = require("../handlers/apiHandler.js");
const { buildCalendar, freezeAt } = require("./support/fixtures");

const MOSQUE_UUID = "mosque-uuid";

const JULY_16 = ["05:30", "06:45", "13:45", "17:50", "21:35", "23:05"];
const JULY_17 = ["05:31", "06:46", "13:45", "17:49", "21:34", "23:04"];

const mockCalendarResponse = (calendar, extra = {}) => {
  axios.request.mockResolvedValue({
    data: { calendar, iqamaCalendar: buildCalendar({}), ...extra },
  });
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("getPrayerTimings — picking the right day", () => {
  const calendar = buildCalendar({
    "2026-07-16": JULY_16,
    "2026-07-17": JULY_17,
  });

  it("uses the user's local date when their timezone is a day ahead of UTC", async () => {
    // 2026-07-17 08:00 in Sydney is still 2026-07-16 22:00 UTC. Reading the
    // server's date would serve the user yesterday's timings all morning.
    freezeAt("2026-07-17 08:00", "Australia/Sydney");
    mockCalendarResponse(calendar);

    const data = await getPrayerTimings(MOSQUE_UUID, "Australia/Sydney");

    expect(data.times).toEqual(["05:31", "13:45", "17:49", "21:34", "23:04"]);
  });

  it("uses the user's local date when their timezone is a day behind UTC", async () => {
    // 2026-07-16 20:00 in Los Angeles is already 2026-07-17 03:00 UTC.
    freezeAt("2026-07-16 20:00", "America/Los_Angeles");
    mockCalendarResponse(calendar);

    const data = await getPrayerTimings(MOSQUE_UUID, "America/Los_Angeles");

    expect(data.times).toEqual(["05:30", "13:45", "17:50", "21:35", "23:05"]);
  });

  it("drops shuruq so that index 0..4 still maps to Fajr..Isha", async () => {
    freezeAt("2026-07-16 12:00", "Europe/Paris");
    mockCalendarResponse(calendar);

    const data = await getPrayerTimings(MOSQUE_UUID, "Europe/Paris");

    expect(data.times).toHaveLength(5);
    expect(data.times).not.toContain("06:45"); // Shuruq
    expect(data.times[0]).toBe("05:30"); // Fajr
    expect(data.times[4]).toBe("23:05"); // Isha
  });
});

describe("getPrayerTimings — failure modes", () => {
  beforeEach(() => freezeAt("2026-07-16 12:00", "Europe/Paris"));

  it("rejects rather than returning partial data when today's row is missing", async () => {
    // A calendar gap must surface as an error the handlers translate into an
    // apology, never as `times: undefined` read downstream as a prayer time.
    mockCalendarResponse(buildCalendar({ "2026-07-17": JULY_17 }));

    await expect(getPrayerTimings(MOSQUE_UUID, "Europe/Paris")).rejects.toThrow(
      "Received Empty Response",
    );
  });

  it("maps a 404 to 'Mosque not found' so the skill re-prompts for a mosque", async () => {
    // Handlers branch on this exact message to re-offer the mosque list; any
    // other message ends the session with a generic error instead.
    axios.request.mockRejectedValue({ response: { status: 404 } });

    await expect(getPrayerTimings(MOSQUE_UUID, "Europe/Paris")).rejects.toThrow(
      "Mosque not found",
    );
  });

  it("keeps the iqama calendar only when it was asked for", async () => {
    mockCalendarResponse(buildCalendar({ "2026-07-16": JULY_16 }));

    const withoutIqama = await getPrayerTimings(MOSQUE_UUID, "Europe/Paris");
    expect(withoutIqama.iqamaCalendar).toBeUndefined();

    mockCalendarResponse(buildCalendar({ "2026-07-16": JULY_16 }));
    const withIqama = await getPrayerTimings(MOSQUE_UUID, "Europe/Paris", true);
    expect(withIqama.iqamaCalendar).toBeDefined();
  });
});

describe("getDateAndMonthForTimezone", () => {
  it("returns null for an unknown timezone so callers fall back to server time", async () => {
    expect(getDateAndMonthForTimezone("Mars/Olympus_Mons")).toBeNull();
    expect(getDateAndMonthForTimezone(undefined)).toBeNull();
  });

  it("returns a zero-based month, matching the calendar's array index", async () => {
    freezeAt("2026-01-05 12:00", "Europe/Paris");

    expect(getDateAndMonthForTimezone("Europe/Paris")).toEqual({
      date: 5,
      month: 0,
    });
  });
});

describe("getMosqueList", () => {
  it("caps the list at five mosques so the spoken menu stays usable", async () => {
    axios.request.mockResolvedValue({
      data: Array.from({ length: 12 }, (_, i) => ({
        name: `Mosque ${i}`,
        uuid: `uuid-${i}`,
        proximity: i * 100,
      })),
    });

    const list = await getMosqueList(false, 48.85, 2.35);

    expect(list).toHaveLength(5);
    expect(list[0]).toMatchObject({ primaryText: "Mosque 0", uuid: "uuid-0" });
  });

  it("throws on an empty result instead of offering an empty menu", async () => {
    axios.request.mockResolvedValue({ data: [] });

    await expect(getMosqueList(false, 48.85, 2.35)).rejects.toThrow(
      "Received Empty Response",
    );
  });

  it("searches by coordinates when no search word is given", async () => {
    axios.request.mockResolvedValue({ data: [{ name: "M", uuid: "u" }] });

    await getMosqueList(false, 48.85, 2.35);

    expect(axios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("lat=48.85&lon=2.35"),
      }),
    );
  });
});
