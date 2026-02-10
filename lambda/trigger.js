const authHandler = require("./handlers/authHandler");
const dbHandler = require("./handlers/dynamoDbHandler");
const awsSsmHandler = require("./handlers/awsSsmHandler");
const sqsHandler = require("./handlers/sqsHandler");

async function getUserData(userId, eventTimestamp) {
  try {
    const userDetails = await dbHandler.GetAzanUserInfo(userId);

    if (!userDetails) {
      console.log(`User details not found for userId: ${userId}`);
      return null;
    }

    const { refresh_token, endpointId } = userDetails;

    if (!refresh_token || !endpointId) {
      console.log(`Missing refresh_token or endpointId for userId: ${userId}`);
      return null;
    }

    console.log(`Getting access token for userId: ${userId}`);
    const tokenResponse =
      await authHandler.getAccessTokenFromRefreshToken(refresh_token);
    const accessToken = tokenResponse.access_token;

    return { accessToken, endpointId, eventTimestamp };
  } catch (error) {
    console.error(`Error processing userId ${userId}:`, error);
    return null;
  }
}

exports.handler = async (event) => {
  console.log("Trigger Event Received:", JSON.stringify(event));
  await awsSsmHandler.handler();

  const mosqueId = event.mosqueId;

  if (!mosqueId) {
    console.error("No mosqueId found in event");
    return;
  }

  try {
    const users = event.userIds;
    const validationTimestamp = new Date().toISOString();

    // Process users concurrently to get data
    const results = await Promise.all(
      users.map((user) => getUserData(user, validationTimestamp)),
    );
    const validUsers = results.filter((u) => u !== null);

    console.log(`Retrieved data for ${validUsers.length} users`);

    const batchSize = parseInt(process.env.SQS_QUEUE_BATCH_SIZE || "10");
    const queueUrl = process.env.SQS_QUEUE_URL;

    if (!queueUrl) {
      throw new Error("SQS_QUEUE_URL environment variable is not defined");
    }

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
