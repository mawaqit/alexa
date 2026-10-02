const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
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

const AZAN_RESERVED_KEYS = new Set(["updatedTimestamp", "createdTimestamp"]);

/**
 * Creates or updates an Azan user in a single atomic UpdateExpression, touching
 * only the attributes passed in.
 *
 * Must never be a get-then-Put. On account linking this runs concurrently with
 * azan-lambda's AcceptGrant and Discover handlers on the same row; a Put
 * replaces the whole item from a (possibly stale, eventually consistent) read,
 * which silently erased the endpointId Discover had just written — leaving the
 * user linked but never receiving the adhan.
 * Mirrors updateAzanUserInfo in azan-lambda/src/services/azanUsers.ts.
 */
async function UpdateAzanUserInfo(
  id,
  { refreshToken, endpointId, ...otherAttributes },
) {
  const timestamp = new Date().toISOString();

  let updateExpression =
    "SET #updatedTimestamp = :updatedTimestamp, #createdTimestamp = if_not_exists(#createdTimestamp, :createdTimestamp)";
  const names = {
    "#updatedTimestamp": "updatedTimestamp",
    "#createdTimestamp": "createdTimestamp",
  };
  const values = {
    ":updatedTimestamp": timestamp,
    ":createdTimestamp": timestamp,
  };

  // The trigger reads snake_case refresh_token.
  if (refreshToken != null) {
    updateExpression += ", #refresh_token = :refresh_token";
    names["#refresh_token"] = "refresh_token";
    values[":refresh_token"] = refreshToken;
  }
  if (endpointId != null) {
    updateExpression += ", #endpointId = :endpointId";
    names["#endpointId"] = "endpointId";
    values[":endpointId"] = endpointId;
  }
  for (const [key, value] of Object.entries(otherAttributes)) {
    // DynamoDB has no `undefined`; a placeholder without a value fails the
    // whole update.
    if (AZAN_RESERVED_KEYS.has(key) || value === undefined) continue;
    updateExpression += `, #attr_${key} = :val_${key}`;
    names[`#attr_${key}`] = key;
    values[`:val_${key}`] = value;
  }

  const params = {
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: "ALL_NEW",
  };

  try {
    const data = await dynamo.send(new UpdateCommand(params));
    console.log(
      `[UpdateAzanUserInfo] Updated user ${id}: fields=${Object.values(names).join(",")} hasRefreshToken=${Boolean(data.Attributes?.refresh_token)} hasEndpointId=${Boolean(data.Attributes?.endpointId)}`,
    );
    return data.Attributes;
  } catch (error) {
    console.error(
      `[UpdateAzanUserInfo] Error updating user info for id ${id}:`,
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

// ---------------------------------------------------------------------------
// Cross-stage cleanup
//
// Dev and prod share one skill id, so a user has the same Alexa user id in
// both, and a skill event (SkillDisabled, "delete my data") can land on either
// stage's Lambda regardless of which stage holds the user's data. Deletion
// therefore always sweeps every stage's tables, so neither Lambda needs to know
// where the data lives. Both stages' tables live in this account and region;
// the names must stay in step with serverless.yml.
// ---------------------------------------------------------------------------

const CLEANUP_STAGES = ["dev", "prod"];
const persistenceTableFor = (stage) => `mawaqit-alexa-user-data-${stage}`;
const azanTableFor = (stage) => `mawaqit-alexa-azan-users-data-${stage}`;

/**
 * Runs `operation` against every stage, never stopping at the first failure:
 * one stage being down must not leave the other stage's data behind.
 * A missing table is skipped, not failed — otherwise a stage that was never
 * provisioned would make every deletion report failure forever.
 * Throws after all stages were attempted if any genuinely failed.
 */
async function acrossStages(label, operation) {
  const results = await Promise.allSettled(CLEANUP_STAGES.map(operation));
  const failures = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const stage = CLEANUP_STAGES[index];
    if (result.reason?.name === "ResourceNotFoundException") {
      console.warn(`[${label}] No table for stage ${stage}; skipped`);
      return;
    }
    console.error(`[${label}] Failed for stage ${stage}:`, result.reason);
    failures.push(result.reason);
  });
  if (failures.length > 0) throw failures[0];
  return results;
}

/**
 * Looks up the Amazon account ids (`user_id`) persisted for an Alexa user in
 * every stage's persistence table. Best effort: a stage that cannot be read
 * just contributes nothing.
 */
async function GetPersistedAmazonUserIds(alexaUserId) {
  const results = await Promise.allSettled(
    CLEANUP_STAGES.map((stage) =>
      dynamo.send(
        new GetCommand({
          TableName: persistenceTableFor(stage),
          Key: { id: alexaUserId },
          ConsistentRead: true,
        }),
      ),
    ),
  );
  const ids = new Set();
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[GetPersistedAmazonUserIds] Lookup failed:", result.reason);
      continue;
    }
    const item = result.value?.Item;
    const id = item?.attributes?.user_id ?? item?.userId;
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Deletes an Amazon account's row from every stage's Azan table, which stops
 * the adhan trigger pushing to them.
 *
 * Keyed by the Amazon account id (`amzn1.account.…`), NOT the Alexa user id
 * (`amzn1.ask.account.…`) — see userDataCleanup.js for resolving one.
 */
async function DeleteAzanUserInfo(amazonUserId) {
  await acrossStages("DeleteAzanUserInfo", (stage) =>
    dynamo.send(
      new DeleteCommand({
        TableName: azanTableFor(stage),
        Key: { id: amazonUserId },
      }),
    ),
  );
  console.log(`[DeleteAzanUserInfo] Deleted azan user ${amazonUserId}`);
  return true;
}

/** Deletes an Alexa user's row from every stage's persistence table. */
async function DeletePersistedUserInfo(alexaUserId) {
  await acrossStages("DeletePersistedUserInfo", (stage) =>
    dynamo.send(
      new DeleteCommand({
        TableName: persistenceTableFor(stage),
        Key: { id: alexaUserId },
      }),
    ),
  );
  console.log(`[DeletePersistedUserInfo] Deleted user ${alexaUserId}`);
  return true;
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

module.exports = {
  GetAzanUserInfo,
  UpdateAzanUserInfo,
  DeleteAzanUserInfo,
  DeletePersistedUserInfo,
  GetPersistedAmazonUserIds,
  GetPersistenceUsersByMosqueId,
  BatchGetAzanUserInfo,
  GetMosqueAzanData,
  UpdateMosqueAzanData,
  GetUserBySupportId,
};
