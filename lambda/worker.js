const alexaEventSender = require("./handlers/alexaEventSender");
const authHandler = require("./handlers/authHandler");
const awsSsmHandler = require("./handlers/awsSsmHandler");

exports.handler = async (event) => {
  console.log(
    `Worker Lambda Triggered with ${event.Records?.length ?? 0} records`,
  );

  // Ensure SSM parameters (clientId, clientSecret) are loaded for token refresh
  await awsSsmHandler.handler();

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const user = JSON.parse(record.body);
      const { refresh_token, endpointId, eventTimestamp } = user;

      if (!refresh_token || !endpointId) {
        console.warn(
          `Skipping invalid user data for endpointId: ${endpointId ?? "missing"}`,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // Refresh token at processing time to ensure it hasn't expired
      let accessToken;
      try {
        const tokenResponse =
          await authHandler.getAccessTokenFromRefreshToken(refresh_token);
        accessToken = tokenResponse.access_token;
      } catch (refreshError) {
        console.error(
          `Failed to refresh token for messageId: ${record.messageId}:`,
          refreshError.message,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      await alexaEventSender.sendDoorbellEvent(
        accessToken,
        endpointId,
        eventTimestamp,
      );
      console.log(`Successfully processed messageId: ${record.messageId}`);
    } catch (error) {
      console.error(`Error processing record ${record.messageId}:`, error);
      // Add to batchItemFailures to let SQS know this specific message failed
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
