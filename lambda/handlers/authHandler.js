const Alexa = require("ask-sdk-core");
const axios = require("axios");

const AuthHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Authorization.Grant"
        );
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const code = handlerInput.requestEnvelope.request?.body?.grant?.code;
        if (!code) {
            console.error('No authorization code found in the request');
            return handlerInput.responseBuilder.getResponse();
        }
        try {
            const attributes = await attributesManager.getPersistentAttributes() || {};
            attributes.code = code;
            attributesManager.setPersistentAttributes(attributes);
            await attributesManager.savePersistentAttributes();
        } catch (error) {
            console.error('Failed to save authorization code:', error);
        }
        return handlerInput.responseBuilder.getResponse();
    },
};

async function getUserInfo(accessToken) {
    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: 'https://api.amazon.com/user/profile',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    };

    try {
        const response = await axios.request(config);
        console.log("Response in getUserInfo: ", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.log("Error in getUserInfo: ", error);
        throw error;
    }
}

module.exports = {
    AuthHandler, getUserInfo
};
