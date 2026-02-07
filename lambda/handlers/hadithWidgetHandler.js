const Alexa = require("ask-sdk-core");
const apiHandler = require("./apiHandler");
const { getRandomHadith } = require("./apiHandler");
const helperFunctions = require("../helperFunctions");

const InstallHadithWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesInstalled"
        && helperFunctions.getPackageId(handlerInput) === "RandomHadith";
    },
    async handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        const title = requestAttributes.t("hadithWidgetTitle");
        const description = requestAttributes.t("hadithWidgetDescription");
        const attributes = await attributesManager.getPersistentAttributes() || {};
        const locale = helperFunctions.splitLanguage(Alexa.getLocale(handlerInput.requestEnvelope));
        const currentTime = new Date();
        const updateInterval = (process.env.UPDATE_INTERVAL_HADITH_WIDGET_IN_HOURS || 1) * 60 * 60 * 1000;
        const nextUpdateTime = currentTime.getTime() + updateInterval;

        try {
            const hadith = await getRandomHadith(locale);
            const commands = [
                {
                    type: "PUT_OBJECT",
                    namespace: "hadithOfTheDay",
                    key: "hadith",
                    content: {
                        title: title,
                        randomHadith: hadith || description,
                        nextUpdateTime: nextUpdateTime
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
            attributes.isHadithWidgetInstalled = true;
        } catch (error) {
            attributes.isHadithWidgetInstalled = false;
            console.log("Error while installing hadith: ", error);
        }      
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        return handlerInput.responseBuilder
        .withShouldEndSession(true)
        .getResponse();
    }
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.  
 * */
const RemoveHadithWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesRemoved"
        && helperFunctions.getPackageId(handlerInput) === "RandomHadith";
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
const UpdateHadithWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UpdateRequest"
        && helperFunctions.getPackageId(handlerInput) === "RandomHadith";
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
        console.log("Error Type: " + handlerInput.requestEnvelope.request?.error?.type);
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const speakOutput = requestAttributes.t("widgetInstallationErrorPrompt");

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
            helperFunctions.getAplArgument(handlerInput, 0) === "FETCH_NEW_HADITH";
    },
    async handle(handlerInput) {
        return InstallHadithWidgetRequestHandler.handle(handlerInput);
    },
};

const ReadHadithAPLEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" &&
            helperFunctions.getAplArgument(handlerInput, 0) === "READ_HADITH";
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const hadith = helperFunctions.getAplArgument(handlerInput, 1) || requestAttributes.t("hadithWidgetDescription");
        return handlerInput.responseBuilder
            .speak(hadith)
            .withShouldEndSession(true)
            .getResponse();
    },
};

module.exports = {
    InstallHadithWidgetRequestHandler,
    RemoveHadithWidgetRequestHandler,
    UpdateHadithWidgetRequestHandler,
    WidgetInstallationErrorHandler,
    UpdateHadithAPLEventHandler,
    ReadHadithAPLEventHandler
};
