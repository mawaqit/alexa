const Alexa = require("ask-sdk-core");
const apiHandler = require("./apiHandler");
const { getRandomHadith } = require("./apiHandler");
const helperFunctions = require("../helperFunctions");

const InstallWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesInstalled";
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        const title = requestAttributes.t("hadithWidgetTitle");
        const description = requestAttributes.t("hadithWidgetDescription");
        const attributes = await attributesManager.getPersistentAttributes() || {};
        const locale = helperFunctions.splitLanguage(Alexa.getLocale(handlerInput.requestEnvelope));
        try {
            const hadith = await getRandomHadith(locale);
            const commands = [
                {
                    type: "PUT_OBJECT",
                    namespace: "hadithOfTheDay",
                    key: "hadith",
                    content: {
                        title: title,
                        randomHadith: hadith || description
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
            attributes.lastHadithWidgetUpdate = new Date().toISOString();
        } catch (error) {
            console.log("Error while installing hadith: ", error);
        }      
        attributes.isHadithWidgetInstalled = true;
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.  
 * */
const RemoveWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesRemoved";
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes() || {};

        // Remove the instance from the array when the widget has been removed.
        attributes.isHadithWidgetInstalled = false;
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes()

        return handlerInput.responseBuilder.getResponse();
    }
};

/* *
 * UpdateRequest triggers when a user receives an widget update on their device
 * Your skill receives this event if your widget manifest has updateStateChanges set to INFORM  
 * */
const UpdateWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UpdateRequest";
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
 * InstallationError triggers notify the skill about any errors that happened during package installation, removal, or updates.
 * */
const WidgetInstallationErrorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.InstallationError";
    },
    async handle(handlerInput) {
        console.log("Error Type: " + handlerInput.requestEnvelope.request.error.type);

        const speakOutput = "Sorry, there was an error installing the widget. Please try again later";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};


/* *
 * Handler to process any incoming APL UserEvent that originates from a SendEvent command
 * from within the Hadith widget or the Hadith skill APL experience
 * */
const UpdateHadithAPLEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" &&
            handlerInput.requestEnvelope.request.arguments?.[0] === "FETCH_NEW_HADITH";
    },
    async handle(handlerInput) {
        const locale = helperFunctions.splitLanguage(Alexa.getLocale(handlerInput.requestEnvelope));
        const { attributesManager } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        const description = requestAttributes.t("hadithWidgetDescription");
        const title = requestAttributes.t("hadithWidgetTitle");
        const attributes = await attributesManager.getPersistentAttributes() || {};
        const currentTime = new Date();
        const lastUpdate = attributes.lastHadithWidgetUpdate ? new Date(attributes.lastHadithWidgetUpdate) : new Date(0);
        const timeDiff = currentTime - lastUpdate;
        const updateInterval = (process.env.UPDATE_INTERVAL_HADITH_WIDGET_IN_HOURS || 24) * 60 * 60 * 1000;

        if (timeDiff < updateInterval) {
            console.log("Hadith widget already updated: ", attributes.lastHadithWidgetUpdate, timeDiff, lastUpdate);
            return handlerInput.responseBuilder.withShouldEndSession(true).getResponse();
        }
        console.log("Fetching new hadith...");
        const hadith = await getRandomHadith(locale).catch((error) => {
            console.log("Error while fetching hadith: ", error);
            throw error;
        });

        // propagate update to DataStore to send it down to all the devices of a user to reflect in their widgets
        const commands = [
            {
                type: "PUT_OBJECT",
                namespace: "hadithOfTheDay",
                key: "hadith",
                content: {
                    title: title,
                    randomHadith: hadith || description
                }
            }
        ];

        const target = {
            type: "DEVICES",
            items: [Alexa.getDeviceId(handlerInput.requestEnvelope)]
        };

        const tokenResponse = await apiHandler.getAccessToken();
        const apiEndpoint = helperFunctions.getApiEndpoint(handlerInput);
        await apiHandler.updateDatastore(tokenResponse, commands, target, apiEndpoint);
        attributes.lastHadithWidgetUpdate = currentTime.toISOString();
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        return handlerInput.responseBuilder
            .withShouldEndSession(true)
            .getResponse();
    },
};

const ReadHadithAPLEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" &&
            handlerInput.requestEnvelope.request.arguments?.[0] === "READ_HADITH";
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const hadith = handlerInput.requestEnvelope.request.arguments?.[1] || requestAttributes.t("hadithWidgetDescription");

        return handlerInput.responseBuilder
            .speak(hadith)
            .withShouldEndSession(true)
            .getResponse();
    },
};

module.exports = {
    InstallWidgetRequestHandler,
    RemoveWidgetRequestHandler,
    UpdateWidgetRequestHandler,
    WidgetInstallationErrorHandler,
    UpdateHadithAPLEventHandler,
    ReadHadithAPLEventHandler
};
