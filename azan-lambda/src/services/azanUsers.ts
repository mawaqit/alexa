import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { logger } from "../logging/logger";
import type {
  AttributeValue,
  AzanUserRecord,
  AzanUserUpdate,
} from "../types/dynamo";

// CRITICAL: the client must point at PARIS (eu-west-3). This Lambda's compute
// runs in Ireland, so without an explicit region the SDK resolves eu-west-1 and
// every call fails with ResourceNotFound. serverless.yml always injects
// TARGET_DYNAMO_REGION; the branch keeps an unset value from being passed
// through as an explicit `undefined`.
const client = new DynamoDBClient(
  process.env.TARGET_DYNAMO_REGION
    ? { region: process.env.TARGET_DYNAMO_REGION }
    : {},
);
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AZAN_DYNAMO_DB_TABLE;

/** Attribute names the update builder manages itself. */
const RESERVED_KEYS = new Set(["updatedTimestamp", "createdTimestamp"]);

/**
 * Creates or updates an Azan user in a single atomic `UpdateExpression`.
 *
 * The table is written by this Lambda and by the main skill backend at the same
 * time, so this must never be a read-modify-write: two concurrent writers would
 * lose one of the two updates.
 */
export async function updateAzanUserInfo(
  id: string,
  { refreshToken, endpointId, ...otherAttributes }: AzanUserUpdate,
): Promise<AzanUserRecord | undefined> {
  logger.debug("Updating Azan user", { userId: id });

  const timestamp = new Date().toISOString();

  let updateExpression =
    "SET #updatedTimestamp = :updatedTimestamp, #createdTimestamp = if_not_exists(#createdTimestamp, :createdTimestamp)";
  const expressionAttributeNames: Record<string, string> = {
    "#updatedTimestamp": "updatedTimestamp",
    "#createdTimestamp": "createdTimestamp",
  };
  const expressionAttributeValues: Record<string, AttributeValue> = {
    ":updatedTimestamp": timestamp,
    ":createdTimestamp": timestamp,
  };

  // Renamed on the way in: the main backend reads `refresh_token`, snake_case.
  if (refreshToken != null) {
    updateExpression += ", #refresh_token = :refresh_token";
    expressionAttributeNames["#refresh_token"] = "refresh_token";
    expressionAttributeValues[":refresh_token"] = refreshToken;
  }
  if (endpointId != null) {
    updateExpression += ", #endpointId = :endpointId";
    expressionAttributeNames["#endpointId"] = "endpointId";
    expressionAttributeValues[":endpointId"] = endpointId;
  }

  // Everything else is written under its own key, behind a placeholder so an
  // attribute named like a DynamoDB reserved word still works.
  for (const [key, value] of Object.entries(otherAttributes)) {
    if (RESERVED_KEYS.has(key)) continue; // already in the SET clause above
    // DynamoDB has no `undefined`: naming a placeholder without giving it a
    // value makes the SDK reject the whole update. `null` is a real attribute
    // type and is written as-is.
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
    ReturnValues: "ALL_NEW" as const,
  };

  try {
    const data = await dynamo.send(new UpdateCommand(params));
    logger.info("Azan user updated", { userId: id });
    return data.Attributes as AzanUserRecord | undefined;
  } catch (error) {
    logger.error("Azan user update failed", { userId: id, error });
    throw error;
  }
}
