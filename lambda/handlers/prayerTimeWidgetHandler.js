const Alexa = require("ask-sdk-core");
const apiHandler = require("./apiHandler");
const helperFunctions = require("../helperFunctions");
const moment = require("moment-timezone");

const InstallPrayerTimeWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesInstalled"
            && helperFunctions.getPackageId(handlerInput) === "PrayerTime";
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        const persistentAttributes = await attributesManager.getPersistentAttributes();
        if (!persistentAttributes?.uuid) {
            return handlerInput.responseBuilder
                .withShouldEndSession(true)
                .getResponse();
        }
        try {
            const mosqueTimes = await apiHandler.getPrayerTimings(persistentAttributes.uuid);
            const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
            const prayerNames = requestAttributes.t("prayerNames");
            const nextPrayerTime = helperFunctions.getNextPrayerTime(
                requestAttributes,
                mosqueTimes.times,
                userTimeZone,
                prayerNames
            );
            const prayerTime = requestAttributes.t("nextPrayerWithoutMosqueAndTimePrompt", nextPrayerTime.name, nextPrayerTime.time);
            const mosqueName = persistentAttributes.primaryText;
            const title = requestAttributes.t("skillName");
            const currentDateTime = new Date(
                new Date().toLocaleString("en-US", { timeZone: userTimeZone })
            );
            const nextPrayerTimeInMillis = currentDateTime.getTime() + nextPrayerTime.diffInMinutes * 60 * 1000;

            const commands = [
                {
                    type: "PUT_OBJECT",
                    namespace: "nextPrayerTimeWidget",
                    key: "nextPrayerData",
                    content: {
                        title,
                        prayerTime,
                        nextPrayerTime,
                        mosqueName,
                        nextUpdateTime: nextPrayerTimeInMillis
                    }
                }
            ];
            const tokenResponse = await apiHandler.getAccessToken();

            const target = {
                type: "DEVICES",
                items: [Alexa.getDeviceId(handlerInput.requestEnvelope)]
            };
            const apiEndpoint = helperFunctions.getApiEndpoint(handlerInput);
            await apiHandler.updateDatastore(tokenResponse, commands, target, apiEndpoint);
            persistentAttributes.lastPrayerTimeWidgetUpdate = new Date().toISOString();
            persistentAttributes.isPrayerTimeWidgetInstalled = true;
            attributesManager.setPersistentAttributes(persistentAttributes); 
            await attributesManager.savePersistentAttributes();
        } catch (error) {
            console.log("Error while installing prayer time widget: ", error);
        }


        return handlerInput.responseBuilder
            .withShouldEndSession(true)
            .getResponse();
    }
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.  
 * */
const RemovePrayerTimeWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesRemoved"
            && helperFunctions.getPackageId(handlerInput) === "PrayerTime";
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes() || {};

        // Remove the instance from the array when the widget has been removed.
        attributes.isPrayerTimeWidgetInstalled = false;
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes()

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * UpdateRequest triggers when a user receives an widget update on their device
 * Your skill receives this event if your widget manifest has updateStateChanges set to INFORM  
 * */
const UpdatePrayerTimeWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UpdateRequest"
            && helperFunctions.getPackageId(handlerInput) === "PrayerTime";
    },
    async handle(handlerInput) {
        /* for now this information is not needed by this sample skill. 
        Optional: it will be logged for tracking purposes. */
        console.log("From Version" + handlerInput.requestEnvelope.request.fromVersion);
        console.log("To Version" + handlerInput.requestEnvelope.request.toVersion);

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * Handler to process any incoming APL UserEvent that originates from a SendEvent command
 * from within the PrayerTime widget or the PrayerTime skill APL experience
 * */
const UpdatePrayerTimeAPLEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" &&
            helperFunctions.getAplArgument(handlerInput, 0) === "FETCH_PRAYER_TIME";
    },
    async handle(handlerInput) {
        return InstallPrayerTimeWidgetRequestHandler.handle(handlerInput);
    },
};

const ReadPrayerTimeAPLEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" &&
            helperFunctions.getAplArgument(handlerInput, 0) === "READ_PRAYER_TIME";
    },
    async handle(handlerInput) {
        console.log("ReadPrayerTimeAPLEventHandler");
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.skipAplDirective = true;
        sessionAttributes.skipCardDirective = true;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return await helperFunctions.checkForPersistenceData(handlerInput);
    },
};

module.exports = {
    InstallPrayerTimeWidgetRequestHandler,
    RemovePrayerTimeWidgetRequestHandler,
    UpdatePrayerTimeWidgetRequestHandler,
    UpdatePrayerTimeAPLEventHandler,
    ReadPrayerTimeAPLEventHandler
};
