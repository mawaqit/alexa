const authHandler = require("./handlers/authHandler");
const alexaEventSender = require("./handlers/alexaEventSender");
const dbHandler = require("./handlers/dynamoDbHandler");
const awsSsmHandler = require("./handlers/awsSsmHandler");

async function processUser(userId, eventTimestamp) {
    try {
        const userDetails = await dbHandler.GetAzanUserInfo(userId);

        if (!userDetails) {
            console.log(`User details not found for userId: ${userId}`);
            return;
        }

        const { refresh_token, endpointId } = userDetails;

        if (!refresh_token || !endpointId) {
            console.log(`Missing refresh_token or endpointId for userId: ${userId}`);
            return;
        }

        console.log(`Getting access token for userId: ${userId}`);
        const tokenResponse = await authHandler.getAccessTokenFromRefreshToken(refresh_token);
        const accessToken = tokenResponse.access_token;

        console.log(`Sending doorbell event for userId: ${userId}`);
        await alexaEventSender.sendDoorbellEvent(accessToken, endpointId, eventTimestamp);

    } catch (error) {
        console.error(`Error processing userId ${userId}:`, error);
    }
}

exports.handler = async (event) => {
    console.log("Trigger Event Received:", JSON.stringify(event));
    await awsSsmHandler.handler();

    const mosqueId = event.mosqueId;

    if (!mosqueId) {
        console.error("No mosqueId found in event");
        return;
    }

    try {
        const users = event.userIds;

        // Process users concurrently
        const promises = users.map(user => processUser(user, new Date().toISOString()));
        await Promise.all(promises);

        console.log(`Processed ${users.length} users`);
    } catch (error) {
        console.error("Error in trigger handler:", error);
    }
};
