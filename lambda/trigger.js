const dbHandler = require("./handlers/dynamoDbHandler");
const awsSsmHandler = require("./handlers/awsSsmHandler");
const sqsHandler = require("./handlers/sqsHandler");
const eventBridgeScheduler = require("./handlers/eventBridgeScheduler");

exports.handler = async (event) => {
  console.log("Trigger Event Received:", JSON.stringify(event));

  await awsSsmHandler.handler();

  // Check for Daily Update Trigger
  if (event?.type === "DAILY_UPDATE") {
    const { mosqueId, timeZone } = event;
    const apiHandler = require("./handlers/apiHandler");
    const helperFunctions = require("./helperFunctions");

    if (!mosqueId || !timeZone) {
      console.error("Missing mosqueId or timeZone for DAILY_UPDATE");
      return;
    }

    try {
      console.log(`Starting DAILY_UPDATE for mosque: ${mosqueId}`);
      const schedules = await eventBridgeScheduler.listSchedulesForMosque(mosqueId);
      
      const activePrayers = [];
      const allPrayers = helperFunctions.CANONICAL_PRAYER_NAMES;
      
      schedules.forEach(schedule => {
        const name = schedule.Name;
        for (const prayer of allPrayers) {
          if (name === `${mosqueId}-${prayer}`) {
            activePrayers.push(prayer);
            break;
          }
        }
      });

      if (activePrayers.length === 0) {
        console.log(`No active prayer schedules found for mosque: ${mosqueId}`);
        return;
      }

      const prayerTimes = await apiHandler.getPrayerTimings(mosqueId, timeZone);
      
      if (!prayerTimes?.times || prayerTimes.times.length === 0) {
        console.warn(`No prayer times found for mosque: ${mosqueId}`);
        return;
      }

      for (const prayerName of activePrayers) {
        const prayerIndex = allPrayers.indexOf(prayerName);
        if (prayerIndex !== -1 && prayerTimes.times[prayerIndex]) {
          const time = prayerTimes.times[prayerIndex];
          console.log(`Updating schedule for mosque: ${mosqueId}, prayer: ${prayerName}, time: ${time}`);
          await eventBridgeScheduler.updateScheduleTimeOnly(mosqueId, prayerName, time);
        }
      }
      return;
    } catch (error) {
       console.error(`Error in DAILY_UPDATE for mosque ${mosqueId}:`, error);
       throw error;
    }
  }

  const { mosqueId, prayerName } = event;

  if (!mosqueId || !prayerName) {
    console.error("No mosqueId or prayerName found in event");
    return;
  }

  try {
    const batchSize = parseInt(process.env.SQS_QUEUE_BATCH_SIZE || "10");
    const queueUrl = process.env.SQS_QUEUE_URL;

    if (!queueUrl) {
      throw new Error("SQS_QUEUE_URL environment variable is not defined");
    }

    let validUsers = [];
    const validationTimestamp = new Date().toISOString();

    // NEW LOGIC: Fetch users from Persistence Table by mosqueId
    const persistenceUsers =
      await dbHandler.GetPersistenceUsersByMosqueId(mosqueId);
    console.log(
      `Found ${persistenceUsers.length} users for mosque ${mosqueId} in persistence table`,
    );

    // 1. Filter users based on routinePrayers and collect userIds
    const userIdsToFetch = persistenceUsers
      .filter((pUser) => {
        const routinePrayers =
          pUser.attributes?.routinePrayers || pUser.routinePrayers;
        if (!routinePrayers || !Array.isArray(routinePrayers)) {
          return false;
        }
        return routinePrayers.some(
          (p) => p.name.toLowerCase() === prayerName.toLowerCase(),
        );
      })
      .map((pUser) => pUser.userId) // Extract userId (assuming it's mapped to userId in local object, or id from DB)
      .filter((id) => id); // Remove undefined/null ids

    console.log(
      `Filtered down to ${userIdsToFetch.length} users with ${prayerName} enabled.`,
    );

    if (userIdsToFetch.length === 0) {
      console.log(
        `No users found for ${mosqueId} - ${prayerName}. Deleting schedule.`,
      );
      await eventBridgeScheduler.deleteSchedule(mosqueId, prayerName);
      return;
    }

    const azanUsers = await dbHandler.BatchGetAzanUserInfo(userIdsToFetch);
    console.log(
      `Fetched details for ${azanUsers.length} users from Azan table.`,
    );

    // 3. Map to valid user objects for SQS
    validUsers = azanUsers
      .map((user) => {
        const { refresh_token, endpointId } = user;
        if (!refresh_token || !endpointId) {
          console.log(
            `Missing refresh_token or endpointId for userId: ${user.id}`,
          );
          return null;
        }
        return {
          refresh_token,
          endpointId,
          userId: user.id,
          eventTimestamp: validationTimestamp,
        };
      })
      .filter((u) => u !== null);

    console.log(
      `Processing ${validUsers.length} valid users for ${prayerName}`,
    );

    const promises = [];
    for (let i = 0; i < validUsers.length; i += batchSize) {
      const batch = validUsers.slice(i, i + batchSize);
      promises.push(sqsHandler.sendBatchToQueue(batch, queueUrl));
    }

    await Promise.all(promises);
    console.log(`Sent ${promises.length} batches to SQS`);
  } catch (error) {
    console.error("Error in trigger handler:", error);
    throw error;
  }
};
