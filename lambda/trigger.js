const authHandler = require("./handlers/authHandler");
const dbHandler = require("./handlers/dynamoDbHandler");
const awsSsmHandler = require("./handlers/awsSsmHandler");
const sqsHandler = require("./handlers/sqsHandler");
const eventBridgeScheduler = require("./handlers/eventBridgeScheduler");

exports.handler = async (event) => {
  console.log("Trigger Event Received:", JSON.stringify(event));

  // Check for Daily Update Trigger
  if (event?.type === "DAILY_UPDATE") {
    // Lazy load schedulerUpdateHandler to avoid circular dependencies if any
    const schedulerUpdateHandler = require("./handlers/schedulerUpdateHandler");
    return await schedulerUpdateHandler.handleDailyUpdate();
  }

  await awsSsmHandler.handler();

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

    if (userIdsToFetch.length > 0) {
      // 2. Batch fetch user details (tokens, etc.) from Azan Table
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
            // We need to fetch the access token individually still, OR refactor to fetch them later/worker.
            // Current flow requires accessToken here.
            refresh_token,
            endpointId,
            userId: user.id,
          };
        })
        .filter((u) => u !== null);

      // 4. Fetch Access Tokens Concurrently (since we need them for the payload)
      // Optimization: We could move this to the worker if possible, but keeping it here for now to match strict existing logic.
      const tokenPromises = validUsers.map(async (user) => {
        try {
          const tokenResponse =
            await authHandler.getAccessTokenFromRefreshToken(
              user.refresh_token,
            );
          return {
            accessToken: tokenResponse.access_token,
            endpointId: user.endpointId,
            eventTimestamp: validationTimestamp,
          };
        } catch (err) {
          console.error(`Error processing token for user ${user.userId}:`, err);
          return null;
        }
      });

      const tokenResults = await Promise.all(tokenPromises);
      validUsers = tokenResults.filter((u) => u !== null);
    }

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
  }
};
