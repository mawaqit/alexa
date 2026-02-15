const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");

// CRITICAL: Initialize Client pointing to PARIS (eu-west-3)
// If we don't specify the region here, it defaults to eu-west-1 (Ireland) and fails.
const client = new DynamoDBClient({
  region: process.env.TARGET_DYNAMO_REGION,
});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AZAN_DYNAMO_DB_TABLE;

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
      console.log(`[GetAzanUserInfo] User found:`, JSON.stringify(data.Item));
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

async function UpdateAzanUserInfo(
  id,
  { refreshToken, endpointId, emailId, ...otherAttributes },
) {
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
    ...otherAttributes,
  };

  if (!existingUser) {
    console.log(
      `[UpdateAzanUserInfo] User ${id} does not exist. Creating new record.`,
    );
    item.createdTimestamp = timestamp;
  } else {
    console.log(`[UpdateAzanUserInfo] User ${id} exists. Updating record.`);
    item.createdTimestamp = existingUser.createdTimestamp;
  }

  const params = {
    TableName: TABLE_NAME,
    Item: item,
  };

  try {
    console.log(
      `[UpdateAzanUserInfo] Writing item to DynamoDB:`,
      JSON.stringify(item),
    );
    await dynamo.send(new PutCommand(params));
    console.log(`[UpdateAzanUserInfo] Successfully updated/created user ${id}`);
    return item;
  } catch (error) {
    console.error(
      `[UpdateAzanUserInfo] Error updating user info for id ${id}:`,
      error,
    );
    throw error;
  }
}

async function GetPersistenceUsersByMosqueId(mosqueId) {
  console.log(
    `[GetPersistenceUsersByMosqueId] Fetching users for mosqueId: ${mosqueId}`,
  );
  const params = {
    TableName: process.env.PERSISTENCE_ADAPTER_TABLE_NAME,
    IndexName: "mosqueId_index",
    KeyConditionExpression: "mosqueId = :mosqueId",
    ExpressionAttributeValues: {
      ":mosqueId": mosqueId,
    },
  };

  try {
    const data = await dynamo.send(new QueryCommand(params));
    console.log(
      `[GetPersistenceUsersByMosqueId] Found ${data.Items?.length || 0} users.`,
    );
    return data.Items || [];
  } catch (error) {
    console.error(
      `[GetPersistenceUsersByMosqueId] Error fetching users for mosqueId ${mosqueId}:`,
      error,
    );
    throw error;
  }
}

async function BatchGetAzanUserInfo(userIds) {
  if (!userIds || userIds.length === 0) return [];
  console.log(`[BatchGetAzanUserInfo] Fetching ${userIds.length} users.`);

  // DynamoDB BatchGetItem limit is 100 items
  const BATCH_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    chunks.push(userIds.slice(i, i + BATCH_SIZE));
  }

  const allUsers = [];

  for (const chunk of chunks) {
    const keys = chunk.map((id) => ({ id }));
    const params = {
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keys,
        },
      },
    };

    try {
      const data = await dynamo.send(new BatchGetCommand(params));
      if (data.Responses && data.Responses[TABLE_NAME]) {
        allUsers.push(...data.Responses[TABLE_NAME]);
      }

      // Handle UnprocessedKeys if necessary (simple retry logic could be added here,
      // but for now we'll just log warning if any)
      if (
        data.UnprocessedKeys &&
        Object.keys(data.UnprocessedKeys).length > 0
      ) {
        console.warn(
          "[BatchGetAzanUserInfo] Some keys were unprocessed:",
          JSON.stringify(data.UnprocessedKeys),
        );
      }
    } catch (error) {
      console.error("[BatchGetAzanUserInfo] Error in batch get:", error);
      // Construct helpful error message but don't crash whole process if one batch fails?
      // Or throw to let caller handle?
      throw error;
    }
  }

  console.log(
    `[BatchGetAzanUserInfo] Retrieved ${allUsers.length} users successfully.`,
  );
  return allUsers;
}

async function DeleteUserInfo(id) {
  console.log(`[DeleteUserInfo] Attempting delete for id: ${id}`);
  const params = {
    TableName: "mawaqit-alexa-user-data-dev",
    Key: {
      id: id,
    },
  };

  try {
    console.log(
      `[DeleteUserInfo] Deleting item from DynamoDB:`,
      JSON.stringify(params),
    );
    await dynamo.send(new DeleteCommand(params));
    console.log(`[DeleteUserInfo] Successfully deleted user ${id}`);
    return true;
  } catch (error) {
    console.error(
      `[DeleteUserInfo] Error deleting user info for id ${id}:`,
      error,
    );
    throw error;
  }
}

module.exports = {
  GetAzanUserInfo,
  UpdateAzanUserInfo,
  DeleteUserInfo,
  GetPersistenceUsersByMosqueId,
  BatchGetAzanUserInfo,
};
