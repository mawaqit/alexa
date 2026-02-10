const AWS = require("aws-sdk");
const sqs = new AWS.SQS();
const crypto = require("crypto");

async function sendBatchToQueue(users, queueUrl) {
  if (!queueUrl) {
    throw new Error("Queue URL is required");
  }

  // Transform users into SQS batch entries
  const entries = users.map((user) => ({
    Id: crypto.randomUUID(), // Unique ID for the batch entry
    MessageBody: JSON.stringify(user),
  }));

  const params = {
    QueueUrl: queueUrl,
    Entries: entries,
  };

  try {
    const result = await sqs.sendMessageBatch(params).promise();

    if (result.Failed && result.Failed.length > 0) {
      console.error(
        `Failed to send ${result.Failed.length} messages to queue`,
        JSON.stringify(result.Failed),
      );
    }

    if (result.Successful && result.Successful.length > 0) {
      console.log(
        `Successfully sent ${result.Successful.length} messages to queue ${queueUrl}`,
      );
    }

    return result;
  } catch (error) {
    console.error(`Error sending batch to queue ${queueUrl}:`, error);
    throw error;
  }
}

module.exports = {
  sendBatchToQueue,
};
