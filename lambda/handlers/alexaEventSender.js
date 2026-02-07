const axios = require('axios');

const ALEXA_EVENT_URLS = {
    NA: 'https://api.amazonalexa.com/v3/events',
    EU: 'https://api.eu.amazonalexa.com/v3/events',
    FE: 'https://api.fe.amazonalexa.com/v3/events'
};

async function sendDoorbellEvent(accessToken, endpointId, timestamp) {
    if (!accessToken || !endpointId) {
        throw new Error("Access token and endpointId are required for sending doorbell event");
    }

    const eventTime = timestamp || new Date().toISOString();

    const data = JSON.stringify({
        "event": {
            "header": {
                "messageId": require('crypto').randomUUID(),
                "namespace": "Alexa.DoorbellEventSource",
                "name": "DoorbellPress",
                "payloadVersion": "3"
            },
            "endpoint": {
                "scope": {
                    "type": "BearerToken",
                    "token": accessToken
                },
                "endpointId": endpointId
            },
            "payload": {
                "cause": {
                    "type": "PHYSICAL_INTERACTION"
                },
                "timestamp": eventTime
            }
        }
    });

    const regions = [ALEXA_EVENT_URLS.EU, ALEXA_EVENT_URLS.NA, ALEXA_EVENT_URLS.FE];

    for (const url of regions) {
        try {
            console.log(`Attempting to send event to ${url}`);
            const config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                data: data
            };

            const response = await axios.request(config);
            console.log(`Successfully sent event to ${url}:`, JSON.stringify(response.data));
            return response.data; // Success, return immediately
        } catch (error) {
            console.log(`Failed to send event to ${url}:`, error?.response?.data || error.message);
            // Continue to next region
        }
    }

    throw new Error("Failed to send event to all Alexa regions");
}

module.exports = {
    sendDoorbellEvent
};
