const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

// CRITICAL: Initialize Client pointing to PARIS (eu-west-3)
// If we don't specify the region here, it defaults to eu-west-1 (Ireland) and fails.
const client = new DynamoDBClient({ 
  region: process.env.TARGET_DYNAMO_REGION 
});
const dynamo = DynamoDBDocumentClient.from(client);

module.exports.handler = async (event) => {
  const tableName = process.env.TARGET_DYNAMO_TABLE;
  console.log(`CONNECTING TO: ${tableName} in ${process.env.TARGET_DYNAMO_REGION}`);

  try {
    // Try to fetch 1 item just to test connectivity
    const params = {
      TableName: tableName,
      Limit: 1
    };

    const result = await dynamo.send(new ScanCommand(params));
    console.log("DB Result:", result);
    console.log("DB Items:", result.Items);
    console.log("DB Count:", result.Count);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "SUCCESS",
        message: "Connected to DynamoDB in Paris!",
        region: process.env.TARGET_DYNAMO_REGION,
        table: tableName,
        data: result.Items // Should show 1 user record
      }),
    };

  } catch (error) {
    console.error("DB Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: "FAILED",
        error: error.message,
        regionAttempted: process.env.TARGET_DYNAMO_REGION
      }),
    };
  }
};