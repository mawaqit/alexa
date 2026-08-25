const Alexa = require("ask-sdk-core");
const moment = require("moment-timezone");
const apiHandler = require("./apiHandler");
const helperFunctions = require("../helperFunctions");
const { AllPrayerTimeIntentHandler } = require("./intentHandler");

// Pushed when the widget has no mosque configured yet, or the install fetch
// below throws, so the document leaves its "Fetching..." branch instead of
// sitting on it forever (onMount only ever gets one shot at a real fetch).
// nextUpdateTime: -1 is a sentinel distinct from the loading state's 0.
async function pushAllPrayerTimeErrorState(handlerInput, requestAttributes) {
  try {
    const commands = [
      {
        type: "PUT_OBJECT",
        namespace: "allPrayerTimeWidget",
        key: "allPrayerTimeData",
        content: {
          labels: {
            title: requestAttributes.t("widgets.allPrayerTime.title"),
            error: requestAttributes.t("widgets.installationErrorPrompt"),
          },
          data: null,
          nextUpdateTime: -1,
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
    console.error(
      "Error while pushing all prayer time widget error state: ",
      error,
    );
  }
}

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
      await pushAllPrayerTimeErrorState(handlerInput, requestAttributes);
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
      const mosqueName = persistentAttributes.primaryText;
      const currentMoment = moment.tz(userTimeZone);
      const currentTimeStr = currentMoment.format("HH:mm");

      // Once Isha has passed there is no "next" prayer left on today's
      // calendar, so show tomorrow's schedule instead of a stale today's
      // Fajr time paired with a next-day countdown.
      let displayTimes = mosqueTimes.times;
      let targetDateStr = currentMoment.format("YYYY-MM-DD");
      if (currentTimeStr > mosqueTimes.times[4]) {
        const tomorrowTimes = await helperFunctions.getTomorrowPrayerTimes(
          persistentAttributes.uuid,
          userTimeZone,
        );
        if (tomorrowTimes?.times) {
          displayTimes = tomorrowTimes.times;
          targetDateStr = currentMoment
            .clone()
            .add(1, "day")
            .format("YYYY-MM-DD");
        }
      }

      // `mosqueTimes.times`/`displayTimes` line up with prayers[0..4] only
      // because apiHandler.getPrayerTimings already strips shuruq (index 1)
      // from the 6-slot calendar row, and prayerNames — 8 entries, with
      // Jumma/Eid/Shuruq trailing at 5-7 — happens to start in the same
      // Fajr..Isha order. A change to either ordering would silently mislabel
      // prayer times rather than fail.
      const prayers = displayTimes.map((time, index) => ({
        name: prayerNames[index],
        time,
        epoch: helperFunctions.getWallClockEpoch(
          targetDateStr,
          time,
          userTimeZone,
        ),
      }));

      // Refresh right when Isha passes — not at midnight — so the switch to
      // tomorrow's schedule above actually takes effect promptly instead of
      // sitting on today's stale list for the rest of the evening.
      const nextUpdateTime = prayers[4].epoch;

      const commands = [
        {
          type: "PUT_OBJECT",
          namespace: "allPrayerTimeWidget",
          key: "allPrayerTimeData",
          content: {
            labels: {
              title: requestAttributes.t("widgets.allPrayerTime.title"),
              loading: requestAttributes.t("widgets.allPrayerTime.loading"),
              // The countdown on the highlighted row reuses the Next Prayer
              // widget's copy rather than duplicating it under a second key.
              remaining: requestAttributes.t(
                "widgets.nextPrayerTime.remaining",
              ),
              itsTime: requestAttributes.t("widgets.nextPrayerTime.itsTime"),
              hourUnit: requestAttributes.t("widgets.nextPrayerTime.hourUnit"),
              minuteUnit: requestAttributes.t(
                "widgets.nextPrayerTime.minuteUnit",
              ),
            },
            data: {
              prayers,
              mosqueName,
            },
            nextUpdateTime,
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
      await pushAllPrayerTimeErrorState(handlerInput, requestAttributes);
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
    // Not checkForPersistenceData: that ends up at getNextPrayerTime, which
    // speaks only the next prayer — wrong for a widget titled "Prayer Times".
    // AllPrayerTimeIntentHandler already speaks all five (and falls back to
    // checkForPersistenceData itself when no mosque is configured yet).
    return await AllPrayerTimeIntentHandler.handle(handlerInput);
  },
};

module.exports = {
  InstallAllPrayerTimeWidgetRequestHandler,
  RemoveAllPrayerTimeWidgetRequestHandler,
  UpdateAllPrayerTimeWidgetRequestHandler,
  UpdateAllPrayerTimeAPLEventHandler,
  ReadAllPrayerTimeAPLEventHandler,
};
