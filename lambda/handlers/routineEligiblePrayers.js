const helperFunctions = require("../helperFunctions.js");

// Only the first 5 canonical prayers ever get a real daily time back from
// apiHandler.getPrayerTimings (its `times` array is 5 elements: Fajr, Dhuhr,
// Asr, Maghrib, Isha — Shuruq is dropped and Jumma/Eid aren't in it at all).
// This mirrors the same filter the voice flow applies in
// helperFunctions.generatePrayerNameDetailsForRoutine, so anything reading
// this list only ever offers/schedules prayers that flow can also offer.
// Shared by webConfigHandler.js (applying a save) and webMosqueHandler.js
// (showing the website's prayer picker) so the two can't drift apart.
const ROUTINE_ELIGIBLE_PRAYER_NAMES =
  helperFunctions.CANONICAL_PRAYER_NAMES.slice(0, 5);

/**
 * Pairs each routine-eligible canonical prayer name with its time from an
 * apiHandler.getPrayerTimings() response, dropping any the mosque has no
 * time for today.
 */
function buildEligiblePrayerTimes(mosqueTimes) {
  return ROUTINE_ELIGIBLE_PRAYER_NAMES.map((canonicalName, index) => ({
    canonicalName,
    time: mosqueTimes?.times?.[index] || null,
  })).filter((entry) => entry.time);
}

module.exports = { ROUTINE_ELIGIBLE_PRAYER_NAMES, buildEligiblePrayerTimes };
