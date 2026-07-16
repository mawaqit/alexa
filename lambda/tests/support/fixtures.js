const moment = require("moment-timezone");

/**
 * MAWAQIT calendar shape: `calendar[monthIndex][dayOfMonthAsString]` is a
 * 6-slot array `[fajr, shuruq, dhuhr, asr, maghrib, isha]`. Index 1 (shuruq) is
 * dropped by the API handler so the remaining indices line up with the five
 * daily prayers.
 */
const TODAY_TIMINGS = ["05:30", "06:45", "13:45", "17:50", "21:35", "23:05"];
const TOMORROW_TIMINGS = ["05:31", "06:46", "13:45", "17:49", "21:34", "23:04"];

/** Today's `mosqueTimes.times` — shuruq already stripped, as in the session. */
const TODAY_TIMES = TODAY_TIMINGS.filter((_, index) => index !== 1);

/**
 * Builds a calendar where `dates` maps "YYYY-MM-DD" to a 6-slot timings array.
 * Months absent from `dates` stay empty, which mirrors how the fixture is used:
 * only the days a test cares about are populated.
 */
const buildCalendar = (dates) => {
  const calendar = Array.from({ length: 12 }, () => ({}));
  Object.entries(dates).forEach(([date, timings]) => {
    const day = moment(date, "YYYY-MM-DD");
    calendar[day.month()][String(day.date())] = timings;
  });
  return calendar;
};

/** Freezes the clock at the given wall-clock time in `timezone`. */
const freezeAt = (wallClock, timezone) => {
  jest.setSystemTime(
    moment.tz(wallClock, "YYYY-MM-DD HH:mm", timezone).toDate(),
  );
};

module.exports = {
  TODAY_TIMINGS,
  TOMORROW_TIMINGS,
  TODAY_TIMES,
  buildCalendar,
  freezeAt,
};
