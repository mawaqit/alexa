const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

/**
 * Custom Persistence Adapter for DynamoDB using AWS SDK v3.
 * Promotes 'emailId', 'mosqueId', and 'userId' to top-level columns.
 */
class CustomDynamoDbPersistenceAdapter {
  constructor(config) {
    this.tableName = config.tableName;
    this.partitionKeyName = config.partitionKeyName || "id";
    this.attributesName = config.attributesName || "attributes";

    // Fallback to default user id generator if not provided
    this.partitionKeyGenerator =
      config.partitionKeyGenerator ||
      ((requestEnvelope) => {
        if (
          requestEnvelope.session &&
          requestEnvelope.session.user &&
          requestEnvelope.session.user.userId
        ) {
          return requestEnvelope.session.user.userId;
        }
        if (
          requestEnvelope.context &&
          requestEnvelope.context.System &&
          requestEnvelope.context.System.user &&
          requestEnvelope.context.System.user.userId
        ) {
          return requestEnvelope.context.System.user.userId;
        }
        throw new Error("Could not find userId to use as partition key");
      });

    this.dynamoDBDocumentClient = DynamoDBDocumentClient.from(
      config.dynamoDBClient,
    );
  }

  /**
   * Retrieves attributes from DynamoDB.
   * @param {Object} requestEnvelope
   */
  async getAttributes(requestEnvelope) {
    const partitionKey = this.partitionKeyGenerator(requestEnvelope);
    const params = {
      TableName: this.tableName,
      Key: {
        [this.partitionKeyName]: partitionKey,
      },
      ConsistentRead: true,
    };

    try {
      const data = await this.dynamoDBDocumentClient.send(
        new GetCommand(params),
      );
      return data.Item ? data.Item[this.attributesName] : {};
    } catch (error) {
      console.error(
        `Error getting attributes from table ${this.tableName}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Saves attributes to DynamoDB, promoting specific fields to top-level columns.
   * @param {Object} requestEnvelope
   * @param {Object} attributes
   */
  async saveAttributes(requestEnvelope, attributes) {
    const partitionKey = this.partitionKeyGenerator(requestEnvelope);

    const item = {
      [this.partitionKeyName]: partitionKey,
      [this.attributesName]: attributes,
    };

    // Promote specific fields to top-level columns for indexing/visibility
    if (
      attributes.emailId &&
      typeof attributes.emailId === "string" &&
      attributes.emailId.trim() !== ""
    ) {
      item.emailId = attributes.emailId;
    }
    if (
      attributes.uuid &&
      typeof attributes.uuid === "string" &&
      attributes.uuid.trim() !== ""
    ) {
      item.mosqueId = attributes.uuid;
    }
    if (
      attributes.user_id &&
      typeof attributes.user_id === "string" &&
      attributes.user_id.trim() !== ""
    ) {
      item.userId = attributes.user_id;
    }

    const params = {
      TableName: this.tableName,
      Item: item,
    };

    try {
      await this.dynamoDBDocumentClient.send(new PutCommand(params));
    } catch (error) {
      console.error(
        `Error saving attributes to table ${this.tableName}:`,
        error.message,
      );
      throw error;
    }
  }
}

module.exports = { CustomDynamoDbPersistenceAdapter };
