const Alexa = require("ask-sdk-core");
const apiHandler = require("./apiHandler");
const { getRandomHadith } = require("./apiHandler");
const helperFunctions = require("../helperFunctions");
const {
  registerWidgetUsage,
  unregisterWidgetUsage,
} = require("./widgetRegistry");

const PACKAGE_ID = "HadithOfTheDay";

const InstallHadithWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesInstalled" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    const title = requestAttributes.t("widgets.hadithOfTheDay.title");
    const description = requestAttributes.t(
      "widgets.hadithOfTheDay.description",
    );
    await registerWidgetUsage(handlerInput, PACKAGE_ID);
    const locale = helperFunctions.splitLanguage(
      Alexa.getLocale(handlerInput.requestEnvelope),
    );
    const currentTime = new Date();
    // Use actual UTC epoch timestamp for logic comparison
    const updateInterval =
      (process.env.UPDATE_INTERVAL_HADITH_WIDGET_IN_HOURS || 1) *
      60 *
      60 *
      1000;
    const nextUpdateTime = currentTime.getTime() + updateInterval;

    // If you need the HH:mm format for display in APL, use this:
    const nextUpdateDate = new Date(nextUpdateTime);
    const formattedNextUpdateTime = `${String(nextUpdateDate.getHours()).padStart(2, "0")}:${String(nextUpdateDate.getMinutes()).padStart(2, "0")}`;

    try {
      const hadith = await getRandomHadith(locale);
      const commands = [
        {
          type: "PUT_OBJECT",
          namespace: "hadithOfTheDay",
          key: "hadith",
          content: {
            labels: {
              title: title,
            },
            content: {
              hadithText: hadith || description,
            },
            nextUpdateTime: nextUpdateTime,
            formattedNextUpdateTime: formattedNextUpdateTime,
            // Lets the document hold off re-fetching for 60 s after a push.
            pushedAt: Date.now(),
          },
        },
      ];
      const tokenResponse = await apiHandler.getAccessToken();

      const target = {
        type: "DEVICES",
        items: [Alexa.getDeviceId(handlerInput.requestEnvelope)],
      };
      const apiEndpoint = helperFunctions.getApiEndpoint(handlerInput);
      await apiHandler.updateDatastore(
        tokenResponse,
        commands,
        target,
        apiEndpoint,
      );
    } catch (error) {
      console.error("Error while installing hadith: ", error);
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.
 * */
const RemoveHadithWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesRemoved" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  async handle(handlerInput) {
    await unregisterWidgetUsage(handlerInput, PACKAGE_ID);
    return handlerInput.responseBuilder.getResponse();
  },
};

/* *
 * UpdateRequest triggers when a user receives an widget update on their device
 * Your skill receives this event if your widget manifest has updateStateChanges set to INFORM
 * */
const UpdateHadithWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UpdateRequest" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  async handle(handlerInput) {
    // Records toVersion on the device's widget record.
    await registerWidgetUsage(handlerInput, PACKAGE_ID);
    return handlerInput.responseBuilder.getResponse();
  },
};

/* *
 * InstallationError triggers notify the skill about any errors that happened during package installation, removal, or updates.
 * */
const WidgetInstallationErrorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "Alexa.DataStore.PackageManager.InstallationError"
    );
  },
  async handle(handlerInput) {
    // request.error.type already captured in the full request envelope
    // logged by LogRequestInterceptor.
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t("widgets.installationErrorPrompt");

    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};

/* *
 * Handler to process any incoming APL UserEvent that originates from a SendEvent command
 * from within the Hadith widget or the Hadith skill APL experience
 * */
const UpdateHadithAPLEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) === "FETCH_NEW_HADITH"
    );
  },
  async handle(handlerInput) {
    const nextUpdateTime = helperFunctions.getAplArgument(handlerInput, 1);

    const currentTime = Date.now();

    if (!nextUpdateTime || currentTime >= nextUpdateTime) {
      return InstallHadithWidgetRequestHandler.handle(handlerInput);
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

const ReadHadithAPLEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) === "READ_HADITH"
    );
  },
  handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const hadith =
      helperFunctions.getAplArgument(handlerInput, 1) ||
      requestAttributes.t("widgets.hadithOfTheDay.description");
    const sessionAttributes = handlerInput.requestEnvelope?.session
      ? handlerInput.attributesManager.getSessionAttributes()
      : {};
    sessionAttributes.skipAplDirective = true;
    sessionAttributes.skipCardDirective = true;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
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
  ReadHadithAPLEventHandler,
};
