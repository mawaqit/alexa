const Alexa = require("ask-sdk-core");
const moment = require("moment-timezone");
const apiHandler = require("./apiHandler");
const helperFunctions = require("../helperFunctions");
const { AllPrayerTimeIntentHandler } = require("./intentHandler");
const { putWidgetObject } = require("./dataStoreHandler");
const {
  registerWidgetUsage,
  unregisterWidgetUsage,
} = require("./widgetRegistry");

const PACKAGE_ID = "AllPrayerTime";
const NAMESPACE = "allPrayerTimeWidget";
const KEY = "allPrayerTimeData";

// Isha keeps its "It's time" row for one minute, like the Next Prayer widget,
// and only then does the list move on to tomorrow.
const PRAYER_MINUTE_MS = 60 * 1000;
// The device's refresh timer fires at Isha + 1 minute by its own clock. The
// switch happens 5 s earlier on ours, so a device clock running slightly
// ahead doesn't land the refresh a hair early and get today's list again.
const SWITCH_TO_TOMORROW_AFTER_MS = PRAYER_MINUTE_MS - 5 * 1000;

/**
 * Returns times unchanged when it is an array of at least five entries.
 * Throws an Error labeled with which otherwise; does not validate entries.
 */
const requireFivePrayerTimes = (times, which) => {
  if (!Array.isArray(times) || times.length < 5) {
    throw new Error(`${which} prayer times are unavailable`);
  }
  return times;
};

// Pushed instead of any list the skill can't vouch for (no mosque, a failed
// fetch, tomorrow missing after Isha), so the widget never shows another
// day's times as current. Due immediately: the document retries it on the
// next mount, or a minute later while it stays on screen (pushedAt + 60 s).
/**
 * Attempts to replace widget content with a localized errorPromptKey message
 * and null data, due immediately using epoch milliseconds. Translation and
 * Data Store failures are caught, so this resolves without a result.
 */
async function pushAllPrayerTimeErrorState(
  handlerInput,
  requestAttributes,
  errorPromptKey,
) {
  const now = Date.now();
  try {
    await putWidgetObject(handlerInput, NAMESPACE, KEY, {
      labels: {
        title: requestAttributes.t("widgets.allPrayerTime.title"),
        error: requestAttributes.t(errorPromptKey),
      },
      data: null,
      status: "error",
      nextUpdateTime: now,
      pushedAt: now,
    });
  } catch (error) {
    console.error(
      "Error while pushing all prayer time widget error state: ",
      error,
    );
  }
}

const InstallAllPrayerTimeWidgetRequestHandler = {
  /**
   * Matches installation events for the AllPrayerTime package.
   */
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.DataStore.PackageManager.UsagesInstalled" &&
      helperFunctions.getPackageId(handlerInput) === PACKAGE_ID
    );
  },
  /**
   * Records widget usage and pushes five prayer times to the request device.
   * Switches to tomorrow at Isha + 55 seconds; refresh is due at the displayed
   * day's Isha + 60 seconds. All timestamps are epoch milliseconds.
   * Missing mosque data or timing/delivery failures trigger a best-effort
   * error-state push. Persistent-attribute read failures propagate. Returns
   * a response ending the session.
   */
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    await registerWidgetUsage(handlerInput, PACKAGE_ID);
    const persistentAttributes =
      await attributesManager.getPersistentAttributes();
    if (!persistentAttributes?.uuid) {
      await pushAllPrayerTimeErrorState(
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
      const todayTimes = requireFivePrayerTimes(mosqueTimes?.times, "Today's");
      const prayerNames = helperFunctions.extractPhonemeText(
        requestAttributes.t("prayerNames"),
      );
      const mosqueName = persistentAttributes.primaryText;
      const currentMoment = moment.tz(userTimeZone);
      const todayStr = currentMoment.format("YYYY-MM-DD");

      // Once Isha's minute is over there is no "next" prayer left today, so
      // the list moves on to tomorrow. If tomorrow can't be loaded this
      // throws into the error state: showing today's list after Isha would
      // present yesterday's times as upcoming.
      let displayTimes = todayTimes;
      let targetDateStr = todayStr;
      const ishaEpoch = helperFunctions.getWallClockEpoch(
        todayStr,
        todayTimes[4],
        userTimeZone,
      );
      if (Date.now() >= ishaEpoch + SWITCH_TO_TOMORROW_AFTER_MS) {
        const tomorrowTimes = await helperFunctions.getTomorrowPrayerTimes(
          persistentAttributes.uuid,
          userTimeZone,
        );
        displayTimes = requireFivePrayerTimes(
          tomorrowTimes?.times,
          "Tomorrow's",
        );
        targetDateStr = currentMoment
          .clone()
          .add(1, "day")
          .format("YYYY-MM-DD");
      }

      // `mosqueTimes.times`/`displayTimes` line up with prayers[0..4] only
      // because apiHandler.getPrayerTimings already strips shuruq (index 1)
      // from the 6-slot calendar row, and prayerNames — 8 entries, with
      // Jumma/Eid/Shuruq trailing at 5-7 — happens to start in the same
      // Fajr..Isha order. A change to either ordering would silently mislabel
      // prayer times rather than fail.
      const prayers = displayTimes.slice(0, 5).map((time, index) => ({
        name: prayerNames[index],
        time,
        epoch: helperFunctions.getWallClockEpoch(
          targetDateStr,
          time,
          userTimeZone,
        ),
      }));

      // Refresh when Isha's minute ends — not at midnight — so the switch to
      // tomorrow's schedule above takes effect promptly.
      const nextUpdateTime = prayers[4].epoch + PRAYER_MINUTE_MS;

      await putWidgetObject(handlerInput, NAMESPACE, KEY, {
        labels: {
          title: requestAttributes.t("widgets.allPrayerTime.title"),
          loading: requestAttributes.t("widgets.allPrayerTime.loading"),
          // The countdown on the highlighted row reuses the Next Prayer
          // widget's copy rather than duplicating it under a second key.
          remaining: requestAttributes.t("widgets.nextPrayerTime.remaining"),
          itsTime: requestAttributes.t("widgets.nextPrayerTime.itsTime"),
          hourUnit: requestAttributes.t("widgets.nextPrayerTime.hourUnit"),
          minuteUnit: requestAttributes.t("widgets.nextPrayerTime.minuteUnit"),
        },
        data: {
          prayers,
          mosqueName,
        },
        status: "ok",
        nextUpdateTime,
        pushedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error while installing all prayer time widget: ", error);
      await pushAllPrayerTimeErrorState(
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
const RemoveAllPrayerTimeWidgetRequestHandler = {
  /**
   * Matches removal events for the AllPrayerTime package.
   */
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
const UpdateAllPrayerTimeWidgetRequestHandler = {
  /**
   * Matches update requests for the AllPrayerTime package.
   */
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
 * from within the AllPrayerTime widget or the AllPrayerTime skill APL experience
 * */
const UpdateAllPrayerTimeAPLEventHandler = {
  /**
   * Matches APL events whose first argument is FETCH_ALL_PRAYER_TIME.
   */
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) ===
        "FETCH_ALL_PRAYER_TIME"
    );
  },
  /**
   * Refreshes when APL argument 1 (epoch milliseconds) is falsy or due.
   * Otherwise returns a response ending the session. Delegated refresh
   * errors propagate.
   */
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
  /**
   * Matches APL events whose first argument is READ_ALL_PRAYER_TIME.
   */
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        "Alexa.Presentation.APL.UserEvent" &&
      helperFunctions.getAplArgument(handlerInput, 0) === "READ_ALL_PRAYER_TIME"
    );
  },
  /**
   * Speaks all five prayer times through the all-prayer intent, which handles
   * a missing mosque and timing errors. Sets session flags to suppress APL
   * and card directives, then returns the delegated skill response.
   */
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
