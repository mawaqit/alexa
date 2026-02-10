const alexaEventSender = require("./handlers/alexaEventSender");

exports.handler = async (event) => {
  console.log("Worker Lambda Triggered:", JSON.stringify(event));

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const user = JSON.parse(record.body);
      const { accessToken, endpointId, eventTimestamp } = user;

      if (!accessToken || !endpointId) {
        console.log(`Skipping invalid user data: ${JSON.stringify(user)}`);
        continue;
      }

      console.log(
        `Processing messageId: ${record.messageId} for endpointId: ${endpointId}`,
      );
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
