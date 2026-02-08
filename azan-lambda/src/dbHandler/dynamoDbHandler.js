const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

// CRITICAL: Initialize Client pointing to PARIS (eu-west-3)
// If we don't specify the region here, it defaults to eu-west-1 (Ireland) and fails.
const client = new DynamoDBClient({
  region: process.env.TARGET_DYNAMO_REGION
});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AZAN_DYNAMO_DB_TABLE;

async function GetAzanUserInfo(id) {
  console.log(`[GetAzanUserInfo] Fetching user with id: ${id}`);
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: id
    }
  };

  try {
    const data = await dynamo.send(new GetCommand(params));
    if (!data.Item) {
      console.log(`[GetAzanUserInfo] User with id: ${id} not found.`);
    } else {
      console.log(`[GetAzanUserInfo] User found:`, JSON.stringify(data.Item));
    }
    return data.Item;
  } catch (error) {
    console.error(`[GetAzanUserInfo] Error getting user info for id ${id}:`, error);
    throw error;
  }
}

async function UpdateAzanUserInfo(id, { refreshToken, endpointId, emailId, ...otherAttributes }) {
  console.log(`[UpdateAzanUserInfo] Attempting update for id: ${id}`);

  // Check if user exists to determine if we need to set CreatedTimestamp
  const existingUser = await GetAzanUserInfo(id);
  const timestamp = new Date().toISOString();

  // If existingUser is undefined, standard JS optional chaining (?.) will return undefined
  // So existingUser?.refresh_token works even if existingUser is missing.

  const item = {
    id: id,
    refresh_token: refreshToken || existingUser?.refresh_token,
    endpointId: endpointId || existingUser?.endpointId,
    emailId: emailId || existingUser?.emailId,
    updatedTimestamp: timestamp,
    ...otherAttributes
  };

  if (!existingUser) {
    console.log(`[UpdateAzanUserInfo] User ${id} does not exist. Creating new record.`);
    item.createdTimestamp = timestamp;
  } else {
    console.log(`[UpdateAzanUserInfo] User ${id} exists. Updating record.`);
    item.createdTimestamp = existingUser.createdTimestamp;
  }

  const params = {
    TableName: TABLE_NAME,
    Item: item
  };

  try {
    console.log(`[UpdateAzanUserInfo] Writing item to DynamoDB:`, JSON.stringify(item));
    await dynamo.send(new PutCommand(params));
    console.log(`[UpdateAzanUserInfo] Successfully updated/created user ${id}`);
    return item;
  } catch (error) {
    console.error(`[UpdateAzanUserInfo] Error updating user info for id ${id}:`, error);
    throw error;
  }
}

module.exports = {
  GetAzanUserInfo,
  UpdateAzanUserInfo
};

