const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');

/**
 * Custom Persistence Adapter extending the standard DynamoDB adapter.
 * Promotes 'emailId' and 'mosqueId' to top-level columns.
 */
class CustomDynamoDbPersistenceAdapter extends DynamoDbPersistenceAdapter {

    constructor(config) {
        super(config);
    }

    async saveAttributes(requestEnvelope, attributes) {
        // 1. Generate the Partition Key (usually the userId) using the parent class's generator
        const partitionKey = this.partitionKeyGenerator(requestEnvelope);

        // 2. Prepare the DynamoDB Item
        // We use the parent class's property names for consistency (default: 'id' and 'attributes')
        const item = {
            [this.partitionKeyName]: partitionKey,
            [this.attributesName]: attributes // The full JSON blob is still saved here
        };

        // 3. Add the extra columns to the Item if they exist in the session attributes
        // These will be saved as top-level attributes in the DynamoDB table
        if (attributes.emailId && typeof attributes.emailId === 'string') {
            item.emailId = attributes.emailId;
        }

        if (attributes.uuid && typeof attributes.uuid === 'string') {
            item.mosqueId = attributes.uuid;
        }
        // 4. Construct the Put parameters
        const putParams = {
            TableName: this.tableName,
            Item: item
        };

        // 5. Execute the Put operation using the parent's DocumentClient
        try {
            await this.dynamoDBDocumentClient.put(putParams).promise();
        } catch (error) {
            console.error(`Error saving attributes to table ${this.tableName}:`, error.message);
            throw error;
        }
    }
}

module.exports = { CustomDynamoDbPersistenceAdapter };