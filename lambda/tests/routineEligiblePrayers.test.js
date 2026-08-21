/**
 * The mosque times API only ever returns 5 real daily times (Fajr, Dhuhr,
 * Asr, Maghrib, Isha — Shuruq dropped, Jumma/Eid never present at all), so
 * this is the one place that mapping is allowed to live. Both
 * webConfigHandler.js (applying a save) and webMosqueHandler.js (showing the
 * picker) depend on it agreeing with itself.
 */
const {
  ROUTINE_ELIGIBLE_PRAYER_NAMES,
  buildEligiblePrayerTimes,
} = require("../handlers/routineEligiblePrayers.js");

it("is exactly the first 5 canonical prayers, in order", () => {
  expect(ROUTINE_ELIGIBLE_PRAYER_NAMES).toEqual([
    "Fajr",
    "Dhuhr",
    "Asr",
    "Maghrib",
    "Isha",
  ]);
});

describe("buildEligiblePrayerTimes", () => {
  it("pairs each canonical name with its time, in order", () => {
    const result = buildEligiblePrayerTimes({
      times: ["05:30", "13:00", "16:30", "19:45", "21:00"],
    });

    expect(result).toEqual([
      { canonicalName: "Fajr", time: "05:30" },
      { canonicalName: "Dhuhr", time: "13:00" },
      { canonicalName: "Asr", time: "16:30" },
      { canonicalName: "Maghrib", time: "19:45" },
      { canonicalName: "Isha", time: "21:00" },
    ]);
  });

  it("drops any prayer with no time today rather than including a null/empty one", () => {
    const result = buildEligiblePrayerTimes({
      times: [null, "13:00", "16:30", "19:45", "21:00"],
    });

    expect(result).toEqual([
      { canonicalName: "Dhuhr", time: "13:00" },
      { canonicalName: "Asr", time: "16:30" },
      { canonicalName: "Maghrib", time: "19:45" },
      { canonicalName: "Isha", time: "21:00" },
    ]);
  });

  it("returns an empty list rather than throwing when times is missing entirely", () => {
    expect(buildEligiblePrayerTimes({})).toEqual([]);
    expect(buildEligiblePrayerTimes(undefined)).toEqual([]);
  });
});
