const Alexa = require("ask-sdk-core");

const getPersistedData = async (handlerInput) => {
    try{
        const userId = Alexa.getUserId(handlerInput.requestEnvelope);
        const attributesManager = handlerInput.attributesManager;
        const attributes = await attributesManager.getPersistentAttributes() || {};
        console.log('Persisted Attributes for %s is %s ', userId, attributes);

        attributesManager.setPersistentAttributes({
          mosqueName: "Al-Masjid an-Nabawi",
        });
        await attributesManager.savePersistentAttributes();
    }catch(err){
        console.log("Error in getPersistedData: ", err);
        return {}
    }
}

const checkForConsentTokenToAccessDeviceLocation = (handlerInput) => {
    return handlerInput.requestEnvelope.context.System.user.permissions
        && handlerInput.requestEnvelope.context.System.user.permissions.consentToken;
}

module.exports = {
    getPersistedData,
    checkForConsentTokenToAccessDeviceLocation
}