const apiHandler = require("./apiHandler");
const eventBridgeScheduler = require("./eventBridgeScheduler");

/**
 * Handles the daily update of prayer schedules.
 * Scans all mosques with existing schedules, fetches fresh prayer times, and updates the schedules.
 */
async function handleDailyUpdate() {
  console.log("Starting Daily Schedule Update...");

  try {
    // 1. Get all mosques and their active prayer schedules
    const mosquePrayersMap =
      await eventBridgeScheduler.getAllMosqueActivePrayers();
    const mosqueIds = Object.keys(mosquePrayersMap);
    console.log(
      `Found ${mosqueIds.length} mosques to update:`,
      JSON.stringify(mosquePrayersMap),
    );

    const results = {
      total: mosqueIds.length,
      updated: 0,
      failed: 0,
      failures: [],
    };

    // 2. Iterate through each mosque and update its schedules
    for (const mosqueId of mosqueIds) {
      try {
        console.log(`Fetching prayer times for mosque: ${mosqueId}`);
        const prayerTimes = await apiHandler.getPrayerTimings(mosqueId);

        if (!prayerTimes?.times || prayerTimes.times.length === 0) {
          console.warn(`No prayer times found for mosque: ${mosqueId}`);
          results.failed++;
          results.failures.push({
            mosqueId,
            error: "No prayer times returned",
          });
          continue;
        }

        // 3. Update only the ACTIVE schedules for this mosque
        const activePrayers = mosquePrayersMap[mosqueId]; // Array of strings e.g. ["Fajr", "Maghrib"]
        const allPrayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

        // Use a for loop to await async operations sequentially
        for (const prayerName of activePrayers) {
          const prayerIndex = allPrayers.indexOf(prayerName);

          if (prayerIndex !== -1 && prayerTimes.times[prayerIndex]) {
            const time = prayerTimes.times[prayerIndex];
            console.log(
              `Updating schedule for mosque: ${mosqueId}, prayer: ${prayerName}, time: ${time}`,
            );
            await eventBridgeScheduler.updateScheduleTimeOnly(
              mosqueId,
              prayerName,
              time,
            );
          } else {
            console.log(
              `No prayer time found for mosque: ${mosqueId}, prayer: ${prayerName}`,
            );
          }
        }

        results.updated++;
      } catch (error) {
        console.error(`Error updating mosque ${mosqueId}:`, error);
        results.failed++;
        results.failures.push({ mosqueId, error: error.message });
      }
    }

    console.log("Daily Update Completed:", JSON.stringify(results));
    return results;
  } catch (error) {
    console.error("Critical Error in Daily Update Handler:", error);
    throw error;
  }
}

module.exports = {
  handleDailyUpdate,
};
