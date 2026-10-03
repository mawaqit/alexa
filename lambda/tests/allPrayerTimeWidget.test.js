/**
 * Flow: the All Prayer Time widget schedules its own refresh at the epoch of
 * whichever prayer is currently shown as "next" (see allPrayerTimeWidgetHandler.js).
 * Bug: that epoch used to be built by adding a wall-clock delta to Date.now(),
 * which is silently wrong by an hour on the two nights a year the clocks
 * change — the widget would then refresh (or show its countdown) an hour
 * early or late. getWallClockEpoch fixes this by resolving the wall-clock
 * time directly in the mosque's timezone, DST rules included.
 * Test: assert the epoch delta between two wall-clock stamps equals the real
 * elapsed time, in both DST directions, mirroring daylightSaving.test.js.
 */
const { getWallClockEpoch } = require("../helperFunctions.js");

const TZ = "Europe/Paris";

describe("getWallClockEpoch — spring forward (an hour disappears)", () => {
  it("puts real elapsed minutes between two stamps, not wall-clock minutes", () => {
    // 23:30 on the 28th -> 06:30 on the 29th reads as 7h00 on a clock face,
    // but 02:00-03:00 never happens, so only 6h00 really passes.
    const before = getWallClockEpoch("2026-03-28", "23:30", TZ);
    const after = getWallClockEpoch("2026-03-29", "06:30", TZ);

    expect((after - before) / 60000).toBe(360);
  });
});

describe("getWallClockEpoch — fall back (an hour repeats)", () => {
  it("puts real elapsed minutes between two stamps, not wall-clock minutes", () => {
    // 23:30 on the 24th -> 06:30 on the 25th reads as 7h00, but 02:00-03:00
    // happens twice, so 8h00 really passes.
    const before = getWallClockEpoch("2026-10-24", "23:30", TZ);
    const after = getWallClockEpoch("2026-10-25", "06:30", TZ);

    expect((after - before) / 60000).toBe(480);
  });
});

describe("getWallClockEpoch — an ordinary night must not regress", () => {
  it("keeps wall-clock and real elapsed time identical when no transition occurs", () => {
    const before = getWallClockEpoch("2026-07-16", "23:30", TZ);
    const after = getWallClockEpoch("2026-07-17", "06:30", TZ);

    expect((after - before) / 60000).toBe(420);
  });
});
