const Alexa = require("ask-sdk-core");
const moment = require("moment-timezone");
const apiHandler = require("./apiHandler");
const helperFunctions = require("../helperFunctions");
const { putWidgetObject } = require("./dataStoreHandler");
const {
  registerWidgetUsage,
  unregisterWidgetUsage,
} = require("./widgetRegistry");

const PACKAGE_ID = "NextPrayerTime";
const NAMESPACE = "nextPrayerTimeWidget";
const KEY = "nextPrayerData";

// A prayer stays "next" — shown as "It's time" — for its whole minute.
const PRAYER_MINUTE_MS = 60 * 1000;

// Pushed instead of a prayer the skill can't vouch for (no mosque, a failed
// fetch, tomorrow's Fajr unknown after Isha), so the widget never shows a
// guessed time. Due immediately: the document retries it on the next mount,
// or a minute later while it stays on screen (pushedAt + 60 s).
/**
 * Attempts to replace widget content with a localized errorPromptKey message
 * and null data, due immediately using epoch milliseconds. Translation and
 * Data Store failures are caught, so this resolves without a result.
 */
async function pushNextPrayerTimeErrorState(
  handlerInput,
  requestAttributes,
  errorPromptKey,
) {
  const now = Date.now();
  try {
    await putWidgetObject(handlerInput, NAMESPACE, KEY, {
      labels: {
        title: requestAttributes.t("widgets.nextPrayerTime.title"),
        error: requestAttributes.t(errorPromptKey),
      },
      data: null,
      status: "error",
      nextUpdateTime: now,
      pushedAt: now,
    });
  } catch (error) {
    console.error(
      "Error while pushing next prayer widget error state: ",
      error,
    );
  }
}

const InstallPrayerTimeWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesInstalled" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  /**
   * Records widget usage and pushes the next prayer to the request device,
   * with its start as the countdown target in epoch milliseconds. Tomorrow's
   * Fajr must come from the calendar. Missing mosque data or timing/delivery
   * failures trigger a best-effort error-state push. Persistent-attribute
   * read failures propagate. Returns a response ending the session.
   */
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    await registerWidgetUsage(handlerInput, PACKAGE_ID);
    const persistentAttributes =
      await attributesManager.getPersistentAttributes();
    if (!persistentAttributes?.uuid) {
      await pushNextPrayerTimeErrorState(
        handlerInput,
        requestAttributes,
        "mosqueNotRegisteredPrompt",
      );
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
      if (!Array.isArray(mosqueTimes?.times) || mosqueTimes.times.length < 5) {
        throw new Error("Today's prayer times are unavailable");
      }
      const prayerNames = requestAttributes.t("prayerNames");
      const nextPrayerTime = await helperFunctions.getNextPrayerTime(
        requestAttributes,
        mosqueTimes.times,
        userTimeZone,
        prayerNames,
        [],
        persistentAttributes.uuid,
        // After Isha, an unknown Fajr becomes the error state, not a guess.
        { requireTomorrowTimes: true },
      );
      if (!nextPrayerTime?.time) {
        throw new Error("Next prayer could not be determined");
      }
      const mosqueName = persistentAttributes.primaryText;

      // The prayer's exact start, which the countdown runs to. Tomorrow's
      // date once today's occurrence (and its "It's time" minute) is over.
      const currentMoment = moment.tz(userTimeZone);
      let nextUpdateTime = helperFunctions.getWallClockEpoch(
        currentMoment.format("YYYY-MM-DD"),
        nextPrayerTime.time,
        userTimeZone,
      );
      if (nextUpdateTime + PRAYER_MINUTE_MS <= Date.now()) {
        nextUpdateTime = helperFunctions.getWallClockEpoch(
          currentMoment.clone().add(1, "day").format("YYYY-MM-DD"),
          nextPrayerTime.time,
          userTimeZone,
        );
      }

      await putWidgetObject(handlerInput, NAMESPACE, KEY, {
        labels: {
          title: requestAttributes.t("widgets.nextPrayerTime.title"),
          at: requestAttributes.t("widgets.nextPrayerTime.at"),
          remaining: requestAttributes.t("widgets.nextPrayerTime.remaining"),
          itsTime: requestAttributes.t("widgets.nextPrayerTime.itsTime"),
          hourUnit: requestAttributes.t("widgets.nextPrayerTime.hourUnit"),
          minuteUnit: requestAttributes.t("widgets.nextPrayerTime.minuteUnit"),
        },
        data: {
          nextPrayerName: helperFunctions.extractPhonemeText(
            nextPrayerTime.name,
          ),
          nextPrayerTime: nextPrayerTime.time,
          mosqueName,
        },
        status: "ok",
        // Doubles as the countdown target. During the prayer's own minute it
        // is already due; the document's pushedAt + 60 s rule then holds the
        // "It's time" screen for that minute before fetching the next prayer.
        nextUpdateTime,
        formattedNextUpdateTime: nextPrayerTime.time,
        pushedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error while installing prayer time widget: ", error);
      await pushNextPrayerTimeErrorState(
        handlerInput,
        requestAttributes,
        "widgets.loadErrorPrompt",
      );
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

/* *
 * UsagesRemoved triggers when a user removes your widget package on their device.
 * */
const RemovePrayerTimeWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesRemoved" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  /**
   * Marks this device's widget inactive and attempts to remove its data.
   * Registry and delivery failures are caught; returns an empty skill response.
   */
  async handle(handlerInput) {
    await unregisterWidgetUsage(handlerInput, PACKAGE_ID);
    return handlerInput.responseBuilder.getResponse();
  },
};

/* *
 * UpdateRequest triggers when a user receives an widget update on their device
 * Your skill receives this event if your widget manifest has updateStateChanges set to INFORM
 * */
const UpdatePrayerTimeWidgetRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UpdateRequest" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  /**
   * Records the reported package version and returns an empty skill response.
   * Registry persistence failures are caught.
   */
  async handle(handlerInput) {
    // Records toVersion on the device's widget record.
    await registerWidgetUsage(handlerInput, PACKAGE_ID);
    return handlerInput.responseBuilder.getResponse();
  },
};

/* *
 * Handler to process any incoming APL UserEvent that originates from a SendEvent command
 * from within the NextPrayerTime widget or the NextPrayerTime skill APL experience
 * */
const UpdatePrayerTimeAPLEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) === "FETCH_PRAYER_TIME"
    );
  },
  async handle(handlerInput) {
    const nextUpdateTime = helperFunctions.getAplArgument(handlerInput, 1);

    // Allows for a device clock slightly ahead of ours.
    if (helperFunctions.isWidgetRefreshDue(nextUpdateTime)) {
      return InstallPrayerTimeWidgetRequestHandler.handle(handlerInput);
    }

    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .getResponse();
  },
};

const ReadPrayerTimeAPLEventHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) === "READ_PRAYER_TIME"
    );
  },
  async handle(handlerInput) {
    helperFunctions.suppressScreenOutput(handlerInput);
    // Out-of-session safe: checkForPersistenceData reads the mosque from
    // persistence when there is no session.
    return await helperFunctions.checkForPersistenceData(handlerInput);
  },
};

module.exports = {
  InstallPrayerTimeWidgetRequestHandler,
  RemovePrayerTimeWidgetRequestHandler,
  UpdatePrayerTimeWidgetRequestHandler,
  UpdatePrayerTimeAPLEventHandler,
  ReadPrayerTimeAPLEventHandler,
};
