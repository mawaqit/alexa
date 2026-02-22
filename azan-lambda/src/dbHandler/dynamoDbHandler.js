const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

// CRITICAL: Initialize Client pointing to PARIS (eu-west-3)
// If we don't specify the region here, it defaults to eu-west-1 (Ireland) and fails.
const client = new DynamoDBClient({
  region: process.env.TARGET_DYNAMO_REGION,
});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AZAN_DYNAMO_DB_TABLE;
const PERSISTENCE_TABLE_NAME = process.env.persistenceAdapterTableName;

async function GetAzanUserInfo(id) {
  console.log(`[GetAzanUserInfo] Fetching user with id: ${id}`);
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: id,
    },
  };

  try {
    const data = await dynamo.send(new GetCommand(params));
    if (!data.Item) {
      console.log(`[GetAzanUserInfo] User with id: ${id} not found.`);
    } else {
      console.log(`[GetAzanUserInfo] User found with id: ${data.Item.id}`);
    }
    return data.Item;
  } catch (error) {
    console.error(
      `[GetAzanUserInfo] Error getting user info for id ${id}:`,
      error,
    );
    throw error;
  }
}

async function getUsersByMosqueId(mosqueId) {
  console.log(`Querying ${PERSISTENCE_TABLE_NAME} for mosqueId: ${mosqueId}`);
  const params = {
    TableName: PERSISTENCE_TABLE_NAME,
    IndexName: "mosqueId_index",
    KeyConditionExpression: "mosqueId = :mosqueId",
    ExpressionAttributeValues: {
      ":mosqueId": mosqueId,
    },
  };

  try {
    const data = await dynamo.send(new QueryCommand(params));
    console.log(`Found ${data.Items.length} users for mosqueId ${mosqueId}`);
    return data.Items;
  } catch (error) {
    console.error("Error querying persistence table:", error);
    throw error;
  }
}

async function UpdateAzanUserInfo(
  id,
  { refreshToken, endpointId, emailId, ...otherAttributes },
) {
  console.log(`[UpdateAzanUserInfo] Attempting atomic update for id: ${id}`);

  const timestamp = new Date().toISOString();

  let updateExpression =
    "SET #updatedTimestamp = :updatedTimestamp, #createdTimestamp = if_not_exists(#createdTimestamp, :createdTimestamp)";
  let expressionAttributeNames = {
    "#updatedTimestamp": "updatedTimestamp",
    "#createdTimestamp": "createdTimestamp",
  };
  let expressionAttributeValues = {
    ":updatedTimestamp": timestamp,
    ":createdTimestamp": timestamp,
  };

  if (refreshToken) {
    updateExpression += ", #refresh_token = :refresh_token";
    expressionAttributeNames["#refresh_token"] = "refresh_token";
    expressionAttributeValues[":refresh_token"] = refreshToken;
  }
  if (endpointId) {
    updateExpression += ", #endpointId = :endpointId";
    expressionAttributeNames["#endpointId"] = "endpointId";
    expressionAttributeValues[":endpointId"] = endpointId;
  }
  if (emailId) {
    updateExpression += ", #emailId = :emailId";
    expressionAttributeNames["#emailId"] = "emailId";
    expressionAttributeValues[":emailId"] = emailId;
  }

  // Atomically set any other attributes provided
  Object.entries(otherAttributes).forEach(([key, value]) => {
    updateExpression += `, #attr_${key} = :val_${key}`;
    expressionAttributeNames[`#attr_${key}`] = key;
    expressionAttributeValues[`:val_${key}`] = value;
  });

  const params = {
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "ALL_NEW",
  };

  try {
    const data = await dynamo.send(new UpdateCommand(params));
    console.log(`[UpdateAzanUserInfo] Successfully updated/created user ${id}`);
    return data.Attributes;
  } catch (error) {
    console.error(
      `[UpdateAzanUserInfo] Error in atomic update for id ${id}:`,
      error,
    );
    throw error;
  }
}

module.exports = {
  GetAzanUserInfo,
  UpdateAzanUserInfo,
  getUsersByMosqueId,
};
