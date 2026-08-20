const Alexa = require("ask-sdk-core");
const apiHandler = require("./apiHandler");
const helperFunctions = require("../helperFunctions");

const InstallAllPrayerTimeWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesInstalled" &&
      helperFunctions.getPackageId(handlerInput) === "AllPrayerTime"
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    const persistentAttributes =
      await attributesManager.getPersistentAttributes();
    if (!persistentAttributes?.uuid) {
      return handlerInput.responseBuilder
        .withShouldEndSession(true)
        .getResponse();
    }
    try {
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      const mosqueTimes = await apiHandler.getPrayerTimings(
        persistentAttributes.uuid,
        userTimeZone,
      );
      const prayerNames = helperFunctions.extractPhonemeText(
        requestAttributes.t("prayerNames"),
      );
      const prayers = mosqueTimes.times.map((time, index) => ({
        name: prayerNames[index],
        time,
      }));
      const mosqueName = persistentAttributes.primaryText;
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone }),
      );

      // Which prayer is highlighted keeps changing through the day, but that
      // is recomputed reactively in APL from the live localTime binding, so
      // this only needs to refresh once the *set* of times changes — at the
      // mosque's local midnight — instead of on every prayer transition.
      const midnight = new Date(currentDateTime);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight.getTime() - currentDateTime.getTime();
      // Use actual UTC epoch timestamp for logic comparison
      const nextUpdateTime = Date.now() + msUntilMidnight;
      const formattedNextUpdateTime = "00:00";

      const commands = [
        {
          type: "PUT_OBJECT",
          namespace: "allPrayerTimeWidget",
          key: "allPrayerTimeData",
          content: {
            labels: {
              title: requestAttributes.t("widgets.allPrayerTime.title"),
            },
            data: {
              prayers,
              mosqueName,
            },
            nextUpdateTime,
            formattedNextUpdateTime,
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
      persistentAttributes.lastAllPrayerTimeWidgetUpdate =
        new Date().toISOString();
      persistentAttributes.isAllPrayerTimeWidgetInstalled = true;
      attributesManager.setPersistentAttributes(persistentAttributes);
      await attributesManager.savePersistentAttributes();
    } catch (error) {
      console.error("Error while installing all prayer time widget: ", error);
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.
 * */
const RemoveAllPrayerTimeWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesRemoved" &&
      helperFunctions.getPackageId(handlerInput) === "AllPrayerTime"
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const attributes =
      (await attributesManager.getPersistentAttributes()) || {};

    // Remove the instance from the array when the widget has been removed.
    attributes.isAllPrayerTimeWidgetInstalled = false;
    attributesManager.setPersistentAttributes(attributes);
    await attributesManager.savePersistentAttributes();

    return handlerInput.responseBuilder.getResponse();
  },
};

/* *
 * UpdateRequest triggers when a user receives an widget update on their device
 * Your skill receives this event if your widget manifest has updateStateChanges set to INFORM
 * */
const UpdateAllPrayerTimeWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UpdateRequest" &&
      helperFunctions.getPackageId(handlerInput) === "AllPrayerTime"
    );
  },
  async handle(handlerInput) {
    // fromVersion/toVersion already captured in the full request envelope
    // logged by LogRequestInterceptor; not otherwise needed by this handler.
    return handlerInput.responseBuilder.getResponse();
  },
};

/* *
 * Handler to process any incoming APL UserEvent that originates from a SendEvent command
 * from within the AllPrayerTime widget or the AllPrayerTime skill APL experience
 * */
const UpdateAllPrayerTimeAPLEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) ===
        "FETCH_ALL_PRAYER_TIME"
    );
  },
  async handle(handlerInput) {
    const nextUpdateTime = helperFunctions.getAplArgument(handlerInput, 1);

    const currentTime = Date.now();

    if (!nextUpdateTime || currentTime >= nextUpdateTime) {
      return InstallAllPrayerTimeWidgetRequestHandler.handle(handlerInput);
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

const ReadAllPrayerTimeAPLEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) === "READ_ALL_PRAYER_TIME"
    );
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.requestEnvelope?.session
      ? handlerInput.attributesManager.getSessionAttributes()
      : {};
    sessionAttributes.skipAplDirective = true;
    sessionAttributes.skipCardDirective = true;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return await helperFunctions.checkForPersistenceData(handlerInput);
  },
};

module.exports = {
  InstallAllPrayerTimeWidgetRequestHandler,
  RemoveAllPrayerTimeWidgetRequestHandler,
  UpdateAllPrayerTimeWidgetRequestHandler,
  UpdateAllPrayerTimeAPLEventHandler,
  ReadAllPrayerTimeAPLEventHandler,
};
