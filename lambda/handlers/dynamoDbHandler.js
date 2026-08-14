const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

// CRITICAL: Initialize Client pointing to PARIS (eu-west-3)
// If we don't specify the region here, it defaults to eu-west-1 (Ireland) and fails.
const client = new DynamoDBClient({
  region: process.env.TARGET_DYNAMO_REGION,
});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AZAN_DYNAMO_DB_TABLE;

async function GetAzanUserInfo(id) {
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
      console.log(`[GetAzanUserInfo] User found with id: ${id}`);
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
  { refreshToken, endpointId, ...otherAttributes },
) {
  // Check if user exists to determine if we need to set CreatedTimestamp
  const existingUser = await GetAzanUserInfo(id);
  const timestamp = new Date().toISOString();

  // If existingUser is undefined, standard JS optional chaining (?.) will return undefined
  // So existingUser?.refresh_token works even if existingUser is missing.

  const item = {
    // Preserve every field this call doesn't know about (e.g.
    // pendingMosqueSelection/pendingRoutinePrayers staged by the website —
    // see webConfigHandler.js) — this was previously a plain PutCommand
    // built from scratch, which silently wiped any such field the moment
    // account linking ran, before it ever had a chance to be applied.
    ...existingUser,
    id: id,
    refresh_token: refreshToken ?? existingUser?.refresh_token,
    endpointId: endpointId ?? existingUser?.endpointId,
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
    const itemToLog = { ...item };
    if (itemToLog.refresh_token) itemToLog.refresh_token = "[REDACTED]";

    console.log(
      `[UpdateAzanUserInfo] Writing item to DynamoDB:`,
      JSON.stringify(itemToLog),
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

/**
 * Atomically updates arbitrary attributes on the azan-users-data table via a
 * single UpdateExpression — never a read-modify-write like UpdateAzanUserInfo
 * above. This table is now written concurrently by three call sites (this
 * Lambda's own AuthHandler, azan-lambda's discovery/authorization handlers,
 * and the website's webConfigHandler), so a PutCommand built from a stale
 * read would silently drop whichever writer lost the race. Mirrors
 * azan-lambda/src/services/azanUsers.ts's updateAzanUserInfo.
 *
 * Pass `null` (not `undefined`) to clear a field — DynamoDB has no
 * "undefined" attribute value, so an `undefined` here is simply skipped
 * rather than written.
 */
async function UpdateAzanUserAttributesAtomic(id, attributes) {
  const timestamp = new Date().toISOString();

  let updateExpression =
    "SET #updatedTimestamp = :updatedTimestamp, #createdTimestamp = if_not_exists(#createdTimestamp, :createdTimestamp)";
  const expressionAttributeNames = {
    "#updatedTimestamp": "updatedTimestamp",
    "#createdTimestamp": "createdTimestamp",
  };
  const expressionAttributeValues = {
    ":updatedTimestamp": timestamp,
    ":createdTimestamp": timestamp,
  };

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    updateExpression += `, #attr_${key} = :val_${key}`;
    expressionAttributeNames[`#attr_${key}`] = key;
    expressionAttributeValues[`:val_${key}`] = value;
  }

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
    console.log(`[UpdateAzanUserAttributesAtomic] Updated user ${id}`);
    return data.Attributes;
  } catch (error) {
    console.error(
      `[UpdateAzanUserAttributesAtomic] Error updating user ${id}:`,
      error,
    );
    throw error;
  }
}

async function GetPersistenceUsersByMosqueId(mosqueId) {
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

const MOSQUE_AZAN_TABLE_NAME = process.env.MOSQUE_AZAN_DATA_TABLE;

async function GetMosqueAzanData(id) {
  const params = {
    TableName: MOSQUE_AZAN_TABLE_NAME,
    Key: {
      id: id,
    },
  };
  try {
    const data = await dynamo.send(new GetCommand(params));
    return data.Item;
  } catch (error) {
    console.error(
      `[GetMosqueAzanData] Error getting mosque azan data for id ${id}:`,
      error,
    );
    throw error;
  }
}

async function UpdateMosqueAzanData(id, attributes) {
  const params = {
    TableName: MOSQUE_AZAN_TABLE_NAME,
    Item: {
      id: id,
      ...attributes,
    },
  };
  try {
    await dynamo.send(new PutCommand(params));
    return true;
  } catch (error) {
    console.error(
      `[UpdateMosqueAzanData] Error updating mosque azan data for id ${id}:`,
      error,
    );
    throw error;
  }
}

async function GetUserBySupportId(supportId) {
  const params = {
    TableName: process.env.PERSISTENCE_ADAPTER_TABLE_NAME,
    IndexName: "supportId-index",
    KeyConditionExpression: "supportId = :supportId",
    ExpressionAttributeValues: {
      ":supportId": supportId,
    },
  };

  try {
    const data = await dynamo.send(new QueryCommand(params));
    console.log(`[GetUserBySupportId] Found ${data.Items?.length || 0} users.`);
    return data.Items?.[0] || null;
  } catch (error) {
    console.error(
      `[GetUserBySupportId] Error fetching user for supportId ${supportId}:`,
      error,
    );
    throw error;
  }
}

// Bridges an LWA account id (what the website has, from Login With Amazon)
// to the Alexa-linked persistence row (keyed by the Alexa skill's own user
// id) — the "userId-index" GSI this depends on is a manual DynamoDB step
// (see the plan), not something this repo's IaC provisions.
async function GetPersistenceUserByUserId(userId) {
  const params = {
    TableName: process.env.PERSISTENCE_ADAPTER_TABLE_NAME,
    IndexName: "userId-index",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  };

  try {
    const data = await dynamo.send(new QueryCommand(params));
    console.log(
      `[GetPersistenceUserByUserId] Found ${data.Items?.length || 0} users.`,
    );
    return data.Items?.[0] || null;
  } catch (error) {
    console.error(
      `[GetPersistenceUserByUserId] Error fetching user for userId ${userId}:`,
      error,
    );
    throw error;
  }
}

// Direct lookup by the Alexa skill's own id — used when the caller is
// already inside a live Alexa request and so already knows this id
// directly (interceptors.js), instead of discovering it via the
// userId-index GSI. That GSI can only find a row whose attributes.user_id
// has already been promoted to the top-level userId column, which for a
// brand-new user hasn't happened yet — see webConfigHandler.applyPendingWebConfig.
async function GetPersistenceUserById(id) {
  const params = {
    TableName: process.env.PERSISTENCE_ADAPTER_TABLE_NAME,
    Key: { id },
    // webConfigHandler.applyPendingWebConfig relies on this being the
    // freshest possible copy of `attributes` — it does a read-then-full-replace
    // and is called for independent saves in quick succession (mosque,
    // reciter, prayers), so a default eventually-consistent read here could
    // hand back a snapshot that predates the *previous* save's write and
    // silently wipe it.
    ConsistentRead: true,
  };

  try {
    const data = await dynamo.send(new GetCommand(params));
    return data.Item || null;
  } catch (error) {
    console.error(
      `[GetPersistenceUserById] Error fetching user for id ${id}:`,
      error,
    );
    throw error;
  }
}

module.exports = {
  GetAzanUserInfo,
  UpdateAzanUserInfo,
  UpdateAzanUserAttributesAtomic,
  DeleteUserInfo,
  GetPersistenceUsersByMosqueId,
  BatchGetAzanUserInfo,
  GetMosqueAzanData,
  UpdateMosqueAzanData,
  GetUserBySupportId,
  GetPersistenceUserByUserId,
  GetPersistenceUserById,
  // Exposed so webConfigHandler.js can build a CustomDynamoDbPersistenceAdapter
  // against the same client instead of opening a second connection pool.
  rawDynamoDbClient: client,
};
