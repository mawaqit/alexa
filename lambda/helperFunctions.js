const Alexa = require("ask-sdk-core");
const { randomUUID: uuidv4 } = require("crypto");
const { getMosqueList, getPrayerTimings } = require("./handlers/apiHandler.js");
const { getDataSourceforMosqueList } = require("./datasources.js");
const mosqueListApl = require("./aplDocuments/mosqueListApl.json");
const moment = require("moment-timezone");
const { getLatLng } = require("./handlers/googleGeoApiHandler.js");
const {
  translate,
  detectLanguage,
} = require("./handlers/googleTranslateHandler.js");
const prayerTimeApl = require("./aplDocuments/characterDisplayApl.json");
const SKILL_ID =
  process.env.MAWAQIT_ALEXA_SKILL_ID ||
  "amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506";
const eventBridgeScheduler = require("./handlers/eventBridgeScheduler.js");
const authHandler = require("./handlers/authHandler");
const dbHandler = require("./handlers/dynamoDbHandler");

const CANONICAL_PRAYER_NAMES = [
  "Fajr",
  "Dhuhr",
  "Asr",
  "Maghrib",
  "Isha",
  "Jumma",
  "Eid",
  "Shuruq",
];

const getPersistedData = async (handlerInput) => {
  try {
    const userId = Alexa.getUserId(handlerInput.requestEnvelope);
    const attributesManager = handlerInput.attributesManager;
    const attributes =
      (await attributesManager.getPersistentAttributes()) || {};
    console.log("Persisted Attributes for %s is %s ", userId, attributes);
    return attributes;
  } catch (err) {
    console.log("Error in getPersistedData: ", err);
    return null;
  }
};

const checkForConsentTokenToAccessDeviceLocation = (handlerInput) => {
  return (
    handlerInput.requestEnvelope.context.System.user.permissions
      ?.consentToken &&
    handlerInput.requestEnvelope.context.System?.apiAccessToken
  );
};

const createDirectivePayload = (
  aplDocument,
  dataSources = {},
  type = "Alexa.Presentation.APL.RenderDocument",
) => {
  return {
    type: type,
    token: uuidv4(),
    document: aplDocument,
    datasources: dataSources,
  };
};

const getNextPrayerTime = async (
  requestAttributes,
  times,
  timezone,
  prayerNames,
  iqamaTime = [],
  mosqueUuid = null,
) => {
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  // Get the current moment object with time zone information
  const now = moment(currentDateTime);
  console.log("Now: ", JSON.stringify(now));

  // Parse times into moment objects (assuming times are in your current time zone)
  const timeMoments = times.map((time, index) =>
    generateNextPrayerTime(
      requestAttributes,
      time,
      now,
      prayerNames[index],
      iqamaTime[index],
      timezone,
    ),
  );
  console.log("Time Moments: ", timeMoments);
  // Find the first time greater than or equal to current time (considering time zone)
  const nextTime = timeMoments.find(({ time }) => time.isSameOrAfter(now));
  console.log("Next Time: ", nextTime);
  if (nextTime) {
    console.log(
      "The first time greater than or equal to current time is:",
      nextTime,
    );
    return {
      name: nextTime.name,
      time: nextTime.time.format("HH:mm"),
      diffInMinutesPrompt: nextTime.diffInMinutesPrompt,
      diffInMinutes: nextTime.diffInMinutes,
    };
  } else {
    console.log("No time is greater than or equal to current time: ", times[0]);
    // All of today's slots have passed → the next one is tomorrow's first
    // prayer (or iqama). Their actual times can differ from today's, so fetch
    // them from the calendar when we can rather than reusing today's times.
    const isIqama = Array.isArray(iqamaTime) && iqamaTime.length > 0;
    const tomorrowBase = moment(now).add(1, "days");
    let firstPrayerTime = times[0];
    let firstIqamaTime = iqamaTime[0];
    if (mosqueUuid) {
      try {
        const tomorrowTimes = await getTomorrowPrayerTimes(
          mosqueUuid,
          timezone,
        );
        if (tomorrowTimes?.times?.[0]) {
          firstPrayerTime = tomorrowTimes.times[0];
        }
        if (isIqama) {
          const tomorrowIqama = await getTomorrowIqamaTimes(
            mosqueUuid,
            timezone,
          );
          if (tomorrowIqama?.[0]) {
            firstIqamaTime = tomorrowIqama[0];
          }
        }
      } catch (error) {
        console.log("Error fetching tomorrow's times: ", error);
      }
    }
    // For iqama, resolve tomorrow's first iqama moment (absolute or offset from
    // the prayer time); otherwise use tomorrow's first prayer time directly.
    const nextMoment = isIqama
      ? resolveIqamaMoment(firstIqamaTime, tomorrowBase, firstPrayerTime)
      : generateMomentObject(firstPrayerTime, tomorrowBase);
    const currentTime = now.format("YYYY-MM-DDTHH:mm");
    const nextTimeMoment = nextMoment.format("YYYY-MM-DDTHH:mm");
    const diffInMinutesPrompt = calculateMinutes(
      requestAttributes,
      currentTime,
      nextTimeMoment,
      timezone,
    );
    const diffInMinutes = getDifferenceInMinutes(
      currentTime,
      nextTimeMoment,
      timezone,
    );
    return {
      name: prayerNames[0],
      time: nextMoment.format("HH:mm"),
      diffInMinutesPrompt: diffInMinutesPrompt,
      diffInMinutes: diffInMinutes,
    };
  }
};

const checkForPersistenceData = async (handlerInput) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const { persistentAttributes, mosqueTimes } = sessionAttributes;
  console.log("Persisted Data: ", persistentAttributes);
  const requestAttributes = attributesManager.getRequestAttributes();
  if (persistentAttributes) {
    return await getPrayerTimingsForMosque(handlerInput, mosqueTimes, "");
  }
  const isLaunchRequest =
    Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
  if (isLaunchRequest) {
    console.log("No persistent data found, prompting user to select mosque.");
    const speakOutput =
      requestAttributes.t("thankYouPrompt") +
      requestAttributes.t("mosqueNotRegisteredPrompt") +
      requestAttributes.t("selectMosquePrompt");
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(false)
      .getResponse();
  }
  return await getListOfMosque(
    handlerInput,
    requestAttributes.t("thankYouPrompt") +
      requestAttributes.t("mosqueNotRegisteredPrompt"),
  );
};

const getPrayerTimingsForMosque = async (
  handlerInput,
  mosqueTimes,
  speakOutput,
) => {
  const { attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const { persistentAttributes } = attributesManager.getSessionAttributes();
  try {
    const userTimeZone = await getUserTimezone(handlerInput);
    const locale = Alexa.getLocale(handlerInput.requestEnvelope);
    const prayerNames = requestAttributes.t("prayerNames");
    const nextPrayerTime = await getNextPrayerTime(
      requestAttributes,
      mosqueTimes.times,
      userTimeZone,
      prayerNames,
      [],
      persistentAttributes?.uuid,
    );
    speakOutput += requestAttributes.t(
      "nextPrayerTimePrompt",
      nextPrayerTime.name, // 1st %s: Prayer Name
      nextPrayerTime.diffInMinutesPrompt, // 2nd %s: Time Left
      formatTime(nextPrayerTime.time, locale), // 3rd %s: Hour
      persistentAttributes.primaryText, // 4th %s: Mosque Name
    );

    // const routinePrayerDetails = { ...nextPrayerTime };
    // const phonemeText = extractPhonemeText([nextPrayerTime.name])[0];
    // routinePrayerDetails.name = phonemeText ? phonemeText : nextPrayerTime.name;
    // routinePrayerDetails.namePhoneme = nextPrayerTime.name;
    // routinePrayerDetails.canonicalName = CANONICAL_PRAYER_NAMES[mosqueTimes.times.findIndex(time => time === nextPrayerTime.time)]
    // if (
    //   !(await checkForRoutinePrayerAlreadyExists(
    //     handlerInput,
    //     routinePrayerDetails,
    //   ))
    // ) {
    //   await saveRequestedRoutinePrayer(handlerInput, routinePrayerDetails);
    //   speakOutput += requestAttributes.t("requestRoutinePrompt");
    // } else {
    //   console.log("Routine for this prayer already exists.");
    // }
    speakOutput += requestAttributes.t("doYouNeedAnythingElsePrompt");
    checkForCharacterDisplay(handlerInput, nextPrayerTime.time);
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(false)
      .getResponse();
  } catch (error) {
    console.log("Error in fetching prayer timings: ", error);
    if (error?.message === "Mosque not found") {
      return await getListOfMosque(handlerInput, speakOutput);
    }
    if (error?.message === "Unable to fetch user timezone") {
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("timezoneErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const getListOfMosque = async (handlerInput, speakOutput) => {
  const { requestEnvelope, responseBuilder, attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const isGeolocationSupported =
    Alexa.getSupportedInterfaces(requestEnvelope)["Geolocation"];
  if (!isGeolocationSupported) {
    const consentToken =
      checkForConsentTokenToAccessDeviceLocation(handlerInput);
    if (!consentToken) {
      return responseBuilder
        .speak(speakOutput + requestAttributes.t("requestForGeoLocationPrompt"))
        .withAskForPermissionsConsentCard(["read::alexa:device:all:address"])
        .getResponse();
    }
    return await getListOfMosqueBasedOnCity(handlerInput, speakOutput);
  }
  return await getListOfMosqueBasedOnGeoLocation(handlerInput, speakOutput);
};

const getListOfMosqueBasedOnGeoLocation = async (handlerInput, speakOutput) => {
  const { requestEnvelope, responseBuilder, attributesManager } = handlerInput;
  const geoObject = requestEnvelope.context.Geolocation;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const requestAttributes = attributesManager.getRequestAttributes();
  if (!geoObject || !geoObject.coordinate) {
    return responseBuilder
      .speak(speakOutput + requestAttributes.t("requestForGeoLocationPrompt"))
      .withAskForPermissionsConsentCard(["alexa::devices:all:geolocation:read"])
      .getResponse();
  } else {
    console.log("Location data: ", JSON.stringify(geoObject));
    const { coordinate } = geoObject;
    const { latitudeInDegrees, longitudeInDegrees } = coordinate;
    try {
      const mosqueList = await getMosqueList(
        false,
        latitudeInDegrees,
        longitudeInDegrees,
      );
      sessionAttributes.mosqueList = mosqueList;
      attributesManager.setSessionAttributes(sessionAttributes);
      return await createResponseDirectiveForMosqueList(
        handlerInput,
        mosqueList,
        speakOutput,
      );
    } catch (error) {
      console.log("Error in fetching mosque list: ", error);
      return responseBuilder
        .speak(requestAttributes.t("errorPromptforMosqueList"))
        .withShouldEndSession(true)
        .getResponse();
    }
  }
};

const getListOfMosqueBasedOnCity = async (handlerInput, speakOutput) => {
  const {
    requestEnvelope,
    serviceClientFactory,
    responseBuilder,
    attributesManager,
  } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const sessionAttributes = attributesManager.getSessionAttributes();
  const consentToken = checkForConsentTokenToAccessDeviceLocation(handlerInput);
  if (!consentToken) {
    return responseBuilder
      .speak(requestAttributes.t("requestForGeoLocationPrompt"))
      .withAskForPermissionsConsentCard(["read::alexa:device:all:address"])
      .getResponse();
  }
  try {
    const deviceId = Alexa.getDeviceId(requestEnvelope);
    const deviceAddressServiceClient =
      serviceClientFactory.getDeviceAddressServiceClient();
    const address = await deviceAddressServiceClient.getFullAddress(deviceId);
    if (!address) {
      return responseBuilder
        .speak(requestAttributes.t("noAddressPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
    console.log(
      "Address successfully retrieved, now responding to user : ",
      address,
    );
    const { city, postalCode } = address;

    if (
      city === null ||
      !city.length ||
      postalCode === null ||
      !postalCode.length
    ) {
      return responseBuilder
        .speak(requestAttributes.t("noAddressPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }

    const { lat, lng } = await getLatLng(address);
    const mosqueList = await getMosqueList(false, lat, lng);
    sessionAttributes.mosqueList = mosqueList;
    attributesManager.setSessionAttributes(sessionAttributes);
    return await createResponseDirectiveForMosqueList(
      handlerInput,
      mosqueList,
      speakOutput,
    );
  } catch (error) {
    console.log("Error in retrieving address: ", error);
    if (error?.message?.startsWith("GeoConversionError")) {
      return responseBuilder
        .speak(requestAttributes.t("errorGeoConversionPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
    if (error?.statusCode === 403) {
      return responseBuilder
        .speak(requestAttributes.t("requestForGeoLocationPrompt"))
        .withAskForPermissionsConsentCard(["read::alexa:device:all:address"])
        .getResponse();
    }
    return responseBuilder
      .speak(requestAttributes.t("errorPromptforMosqueList"))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const createResponseDirectiveForMosqueList = async (
  handlerInput,
  mosqueList,
  speechPrompt,
) => {
  const { responseBuilder, attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const locale = Alexa.getLocale(handlerInput.requestEnvelope);
  const sessionAttributes = attributesManager.getSessionAttributes();
  mosqueList = await Promise.all(
    mosqueList.map(async (mosque) => {
      mosque.primaryText = await translateText(mosque.primaryText, locale);
      return mosque;
    }),
  );
  if (mosqueList != null && mosqueList.length == 1) {
    sessionAttributes.isMosqueRequested = true;
    attributesManager.setSessionAttributes(sessionAttributes);
    speechPrompt += requestAttributes.t(
      "oneMosquePrompt",
      mosqueList[0].primaryText,
    );
    return handlerInput.responseBuilder
      .speak(speechPrompt)
      .withShouldEndSession(false)
      .getResponse();
  }
  responseBuilder.addDirective({
    type: "Dialog.ElicitSlot",
    slotToElicit: "selectedMosque",
    updatedIntent: {
      name: "SelectMosqueIntent",
      confirmationStatus: "NONE",
      slots: {
        selectedMosque: {
          name: "selectedMosque",
          confirmationStatus: "NONE",
        },
      },
    },
  });
  console.log("Mosque List: ", mosqueList);
  const mosqueListPrompt = mosqueList
    .map((mosque, index) => `${index + 1}. ${mosque.primaryText}`)
    .join(", ");
  console.log("Mosque List Prompt: ", mosqueListPrompt);
  speechPrompt += requestAttributes.t("chooseMosquePrompt", mosqueListPrompt);
  if (
    Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
      "Alexa.Presentation.APL"
    ]
  ) {
    const dataSource = await getDataSourceforMosqueList(
      handlerInput,
      mosqueList,
    );
    console.log("Data Source: ", JSON.stringify(dataSource));
    const aplDirective = createDirectivePayload(mosqueListApl, dataSource);
    responseBuilder.addDirective(aplDirective);
    speechPrompt += requestAttributes.t("chooseMosqueByTouchPrompt");
  }
  return responseBuilder
    .speak(speechPrompt)
    .withShouldEndSession(false)
    .getResponse();
};

const getUserTimezone = async (handlerInput) => {
  const { serviceClientFactory, requestEnvelope } = handlerInput;
  const deviceId = Alexa.getDeviceId(requestEnvelope);
  const upsServiceClient = serviceClientFactory.getUpsServiceClient();
  const userTimeZone = await upsServiceClient
    .getSystemTimeZone(deviceId)
    .then((timezone) => {
      console.log("User Timezone: ", timezone);
      return timezone;
    })
    .catch((error) => {
      console.log("Error in fetching user timezone: ", error);
      throw new Error("Unable to fetch user timezone");
    });
  return userTimeZone;
};

function checkForCharacterDisplay(handlerInput, nextPrayerTime) {
  if (
    Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
      "Alexa.Presentation.APLT"
    ]
  ) {
    const dataSource = createDataSourceForPrayerTiming(nextPrayerTime);
    const aplDirective = createDirectivePayload(
      prayerTimeApl,
      dataSource,
      "Alexa.Presentation.APLT.RenderDocument",
    );
    handlerInput.responseBuilder.addDirective(aplDirective);
  }
}

/**
 * Minutes between two "YYYY-MM-DDTHH:mm" wall-clock stamps.
 *
 * Pass `timezone` whenever the answer is spoken to the user: wall-clock stamps
 * carry no UTC offset, so on the two nights a year the clocks change, a plain
 * subtraction is off by an hour — 23:30 to 06:30 across the spring jump reads
 * as 7h when the user really waits 6h. Resolving both stamps in the mosque's
 * zone measures the time actually elapsed.
 *
 * During the autumn repeat an ambiguous stamp resolves to its first (summer)
 * occurrence, which is moment-timezone's default.
 */
const getDifferenceInMinutes = (start, end, timezone) => {
  if (timezone) {
    return moment
      .tz(end, "YYYY-MM-DDTHH:mm", timezone)
      .diff(moment.tz(start, "YYYY-MM-DDTHH:mm", timezone), "minutes");
  }
  const startDate = new Date(start);
  const endDate = new Date(end);

  const diffInMilliseconds = endDate - startDate;
  return diffInMilliseconds / 1000 / 60;
};

function calculateMinutes(requestAttributes, start, end, timezone) {
  const diffInMinutes = getDifferenceInMinutes(start, end, timezone);

  let result;

  if (diffInMinutes >= 60) {
    const hours = Math.floor(diffInMinutes / 60);
    const minutes = Math.floor(diffInMinutes % 60);
    result = requestAttributes.t("hoursAndMinutesPrompt", hours, minutes);
  } else if (diffInMinutes < 1) {
    const diffInSeconds = Math.floor(diffInMinutes * 60);
    result = requestAttributes.t("secondsPrompt", diffInSeconds);
  } else {
    result = requestAttributes.t("minutesPrompt", diffInMinutes);
  }
  return result;
}

//Provides resolved slot value
function getResolvedValue(requestEnvelope, slotName) {
  return requestEnvelope?.request?.intent?.slots?.[slotName]?.resolutions
    ?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name;
}

//Provides resolved slot id
function getResolvedId(requestEnvelope, slotName) {
  return requestEnvelope?.request?.intent?.slots?.[slotName]?.resolutions
    ?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.id;
}

const getPrayerTimeForSpecificPrayer = (
  handlerInput,
  prayerTime,
  currentMoment,
  now,
  prayerName,
  timezone,
) => {
  try {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const [hours, minutes] = prayerTime.split(":");
    const timeMoment = moment(
      `${now.format("YYYY-MM-DD")}T${hours}:${minutes}`,
    );
    // Already passed today → the user is asking about tomorrow's occurrence.
    if (timeMoment.isBefore(currentMoment)) {
      timeMoment.add(1, "days");
    }
    // Measured in the mosque's zone so the countdown stays true across a DST
    // transition; see getDifferenceInMinutes.
    const totalMinutes = getDifferenceInMinutes(
      currentMoment.format("YYYY-MM-DDTHH:mm"),
      timeMoment.format("YYYY-MM-DDTHH:mm"),
      timezone,
    );
    const hoursDiff = Math.floor(totalMinutes / 60);
    const minutesDiff = Math.floor(totalMinutes % 60);
    let speakOutput;
    if (minutesDiff <= 59 && hoursDiff < 1) {
      speakOutput = requestAttributes.t("minutesPrompt", minutesDiff);
    } else {
      speakOutput = requestAttributes.t(
        "hoursAndMinutesPrompt",
        hoursDiff,
        minutesDiff,
      );
    }
    const locale = Alexa.getLocale(handlerInput.requestEnvelope);
    checkForCharacterDisplay(handlerInput, prayerTime);
    return handlerInput.responseBuilder
      .speak(
        requestAttributes.t(
          "nextPrayerTimeWithNamePrompt",
          prayerName,
          formatTime(prayerTime, locale),
          speakOutput,
        ) + requestAttributes.t("doYouNeedAnythingElsePrompt"),
      )
      .withShouldEndSession(false)
      .getResponse();
  } catch (error) {
    console.log("Error in fetching prayer time for specific prayer: ", error);
    return handlerInput.responseBuilder
      .speak(
        "Sorry, I am unable to fetch the prayer time for the specific prayer.",
      )
      .withShouldEndSession(true)
      .getResponse();
  }
};

/**
 * Fetches the prayer times for the day following today (in the mosque's timezone).
 *
 * `mosqueTimes.times` only ever holds today's timings, so when a requested prayer
 * has already passed we need the calendar to know the actual time for the same
 * prayer tomorrow (prayer times drift by a minute or so from day to day).
 *
 * @returns {Promise<{times: string[], shuruq: string}|null>} Tomorrow's timings
 *  aligned with `mosqueTimes.times` (index 0-4 = Fajr..Isha), plus the raw shuruq
 *  time, or `null` when the calendar is unavailable.
 */
const getTomorrowPrayerTimes = async (uuid, timezone) => {
  const data = await getPrayerTimings(uuid, timezone, false, true);
  const calendar = data?.calendar;
  if (!Array.isArray(calendar) || calendar.length === 0) {
    return null;
  }
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const tomorrow = new Date(currentDateTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timings = calendar?.[tomorrow.getMonth()]?.[String(tomorrow.getDate())];
  if (!Array.isArray(timings)) {
    return null;
  }
  // Mirror apiHandler: index 1 (shuruq) is dropped so indices 0-4 map to the
  // five daily prayers, exactly like `mosqueTimes.times`.
  return {
    times: timings.filter((_, index) => index !== 1),
    shuruq: timings[1],
  };
};

/**
 * Fetches the iqama timings for the day following today (in the mosque's
 * timezone).
 *
 * Iqama times live in a separate `iqamaCalendar` and only today's slice is kept
 * in the session, so we re-fetch the calendar to know tomorrow's first iqama.
 * Each entry is either an absolute `HH:mm` time or a minutes-offset applied to
 * the matching prayer time (see `resolveIqamaMoment`).
 *
 * @returns {Promise<Array|null>} Tomorrow's iqama entries aligned with the
 *  prayer indices (index 0 = Fajr), or `null` when unavailable.
 */
const getTomorrowIqamaTimes = async (uuid, timezone) => {
  const data = await getPrayerTimings(uuid, timezone, true);
  const iqamaCalendar = data?.iqamaCalendar;
  if (!Array.isArray(iqamaCalendar) || iqamaCalendar.length === 0) {
    return null;
  }
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const tomorrow = new Date(currentDateTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timings =
    iqamaCalendar?.[tomorrow.getMonth()]?.[String(tomorrow.getDate())];
  return Array.isArray(timings) ? timings : null;
};

/**
 * Returns whether the given `HH:mm` prayer time has already passed relative to
 * `now` (both interpreted in the same timezone as `now`).
 */
const hasPrayerTimePassed = (prayerTime, now) => {
  const [hours, minutes] = prayerTime.split(":");
  const prayerMoment = moment(now).set({
    hour: parseInt(hours),
    minute: parseInt(minutes),
    second: 0,
    millisecond: 0,
  });
  return prayerMoment.isBefore(now);
};

const generateNextPrayerTime = (
  requestAttributes,
  prayerTime,
  now,
  prayerName,
  iqamaTime,
  timezone,
) => {
  const currentMoment = now.format("YYYY-MM-DDTHH:mm");
  const timeMoment = resolveIqamaMoment(iqamaTime, now, prayerTime);
  return {
    name: prayerName,
    time: timeMoment,
    diffInMinutesPrompt: calculateMinutes(
      requestAttributes,
      currentMoment,
      timeMoment.format("YYYY-MM-DDTHH:mm"),
      timezone,
    ),
    diffInMinutes: getDifferenceInMinutes(
      currentMoment,
      timeMoment.format("YYYY-MM-DDTHH:mm"),
      timezone,
    ),
  };
};

const resolveIqamaMoment = (iqamaTime, now, prayerTime) => {
  if (iqamaTime && iqamaTime.includes(":")) {
    return generateMomentObject(iqamaTime, now);
  } else {
    const minutesToAdd = parseInt(iqamaTime || 0);
    return generateMomentObject(prayerTime, now).add(minutesToAdd, "minutes");
  }
};

const generateMomentObject = (time, now) => {
  const [hours, minutes] = time.split(":");
  return moment(now)
    .set("hour", parseInt(hours))
    .set("minute", parseInt(minutes));
};

const translateText = async (text, toLang) => {
  try {
    toLang = splitLanguage(toLang);
    // console.log("Text to convert: ", text);
    const detectedLanguage = await detectLanguage(text);
    if (detectedLanguage === toLang) {
      return text;
    }
    const translatedText = await translate(text, toLang);
    return translatedText ? translatedText : text;
  } catch (error) {
    console.log("Error in converting %s to %s: %s", text, toLang, error);
    return text;
  }
};

async function callDirectiveService(handlerInput, speakOutput) {
  console.log("Call Directive Service");
  try {
    const requestEnvelope = handlerInput.requestEnvelope;
    const directiveServiceClient =
      handlerInput.serviceClientFactory.getDirectiveServiceClient();

    const requestId = requestEnvelope.request.requestId;
    const directive = {
      header: {
        requestId,
      },
      directive: {
        type: "VoicePlayer.Speak",
        speech: speakOutput,
      },
    };

    return await directiveServiceClient.enqueue(directive);
  } catch (error) {
    console.error("Error calling directive service:", error);
    // Continue skill flow without progressive response
    return Promise.resolve();
  }
}

const splitLanguage = (locale) => {
  return locale.split("-")[0];
};

const createDataSourceForPrayerTiming = (time) => {
  return {
    data: {
      text: time,
    },
  };
};

/**
 * Normalize intent filled slots into a consistent map of resolved slot values and validation state.
 *
 * Processes Alexa slot resolution data to produce, for each slot, the original synonym, the resolved value (or the raw value if unresolved), an optional resolution id, and a boolean indicating whether the slot matched a value in the interaction model.
 *
 * @param {Object} filledSlots - The `request.intent.slots` object from an Alexa request.
 * @returns {Object} An object mapping slot names to `{ synonym, value, id, isValidated }`:
 *  - `synonym` {string|undefined} — the raw slot value spoken by the user.
 *  - `value` {string|undefined} — the resolved slot value name when available, otherwise the raw slot value.
 *  - `id` {string|null} — the resolved value id when available, otherwise `null` (or the slot's id if present and unresolved).
 *  - `isValidated` {boolean} — `true` when the slot resolution returned `ER_SUCCESS_MATCH`, `false` otherwise.
 */
function getSlotValues(filledSlots) {
  const slotValues = {};
  console.log(`The filled slots: ${JSON.stringify(filledSlots)}`);

  Object.keys(filledSlots || {}).forEach((key) => {
    const slot = filledSlots[key];
    const name = slot?.name || key;
    const resAuth = slot?.resolutions?.resolutionsPerAuthority?.[0];
    const status = resAuth?.status?.code;
    const valueObj = resAuth?.values?.[0]?.value;

    if (status === "ER_SUCCESS_MATCH" && valueObj) {
      slotValues[name] = {
        synonym: slot?.value,
        value: valueObj.name,
        id: valueObj.id ?? null,
        isValidated: true,
      };
      return;
    }

    if (status === "ER_SUCCESS_NO_MATCH") {
      slotValues[name] = {
        synonym: slot?.value,
        value: slot?.value,
        id: null,
        isValidated: false,
      };
      return;
    }

    slotValues[name] = {
      synonym: slot?.value,
      value: slot?.value,
      id: slot?.id ?? null,
      isValidated: false,
    };
  });

  return slotValues;
}

/**
 * Extracts the intent name from the request envelope.
 *
 * @returns {string|null} The intent name if present, otherwise `null`.
 */
function getIntentName(handlerInput) {
  return handlerInput?.requestEnvelope?.request?.intent?.name || null;
}

const getAllPrayerTimesSpeechoutput = async (handlerInput, mosqueTimes) => {
  const userTimeZone = await getUserTimezone(handlerInput);
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const locale = Alexa.getLocale(handlerInput.requestEnvelope);
  console.log("User Timezone: ", userTimeZone);
  const prayerNames = requestAttributes.t("prayerNames");
  let allPrayerTimes = "";
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: userTimeZone }),
  );
  prayerNames.forEach((prayer, index) => {
    const prayerTime = mosqueTimes.times[index];
    if (prayerTime) {
      const prayerDetails = generateNextPrayerTime(
        requestAttributes,
        prayerTime,
        moment(currentDateTime),
        prayer,
        undefined,
        userTimeZone,
      );
      console.log("Prayer Details for %s: ", prayer, prayerDetails);
      allPrayerTimes += requestAttributes.t(
        "allPrayerTimesPrompt",
        prayer,
        formatTime(prayerDetails.time.format("HH:mm"), locale),
      );
    }
  });
  return allPrayerTimes;
};

const offerAutomation = (timezone, time, prayerName, isJumma = false) => {
  return {
    type: "Connections.StartConnection",
    uri: "connection://AMAZON.OfferAutomation/1",
    onCompletion: "RESUME_SESSION",
    token: generateOperationId(time, prayerName),
    input: {
      automation: {
        trigger: {
          type: "Alexa.Automation.Trigger.Schedule.AbsoluteTime",
          version: "1.0",
          payload: {
            schedule: {
              triggerTime: generateRoutineTime(time),
              timeZoneId: timezone,
              recurrence: isJumma
                ? "RRULE:FREQ=WEEKLY;BYDAY=FR"
                : "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=SU,MO,TU,WE,TH,FR,SA",
            },
          },
        },
        operations: {
          serial: [
            {
              operation: {
                type: "Alexa.Automation.Operation.Skill.StartConnection",
                version: "1.0",
                operationId: generateOperationId(time, prayerName),
                payload: {
                  connectionRequest: {
                    uri: `connection://${SKILL_ID}.PlayAdhaan/1?provider=${SKILL_ID}`,
                    input: {},
                  },
                },
              },
            },
          ],
        },
      },
      renderingData: {
        operations: generateRenderingData(time, prayerName),
      },
    },
  };
};

const generateRoutineTime = (time) => {
  let timeArr = time.split(":");
  return `${timeArr[0]}` + `${timeArr[1]}` + `00`;
};

const generateRenderingData = (time, prayerName) => {
  let key = generateOperationId(time, prayerName);
  let data = {};
  data[`${key}`] = {
    descriptionPrompt: "Play Adhaan",
  };
  return data;
};

const generateOperationId = (time, prayerName) =>
  "PlayAdhaan_" + prayerName + "_" + generateRoutineTime(time);

function extractPhonemeText(phonemeArray) {
  return phonemeArray.map((phoneme) => {
    if (typeof phoneme !== "string") return phoneme;
    // Match text between > and <
    const match = phoneme.match(/>([^<]+)</);
    return match ? match[1] : phoneme;
  });
}

const generateRoutineErrorMessage = (message) => {
  switch (message) {
    case "REJECTED_BY_CUSTOMER":
      return "routineRejected";
    case "AUTOMATION_ALREADY_ENABLED":
      return "routineAlreadyEnabled";
    default:
      return "routineErrorPrompt";
  }
};

/**
 * Escapes only unsafe characters in text nodes within SSML,
 * preserving valid tags like <phoneme>, <break>, etc.
 */
function smartEscapeSSML(ssml) {
  if (!ssml) return "";

  // Step 1: Escape ampersands not already part of entities
  ssml = ssml.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, "&amp;");

  // Step 2: Escape < and > only if they're outside of tag brackets
  // Split the SSML by tags and escape only the text segments
  return ssml
    .split(/(<[^>]+>)/g) // keep tags separate
    .map((segment) => {
      if (segment.startsWith("<")) return segment; // it's a tag — keep as is
      // escape stray < and > in text only
      return segment.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    })
    .join("");
}

async function generatePrayerNameDetailsForRoutine(handlerInput) {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const { persistentAttributes } = sessionAttributes;
  const { routinePrayers } = persistentAttributes;
  const requestAttributes = attributesManager.getRequestAttributes();
  const mosqueTimes = sessionAttributes.mosqueTimes;
  console.log("Mosque Times: ", JSON.stringify(mosqueTimes));
  const prayerNames = requestAttributes.t("prayerNames");
  const prayerNamesForApl = extractPhonemeText(prayerNames);
  const userTimeZone = await getUserTimezone(handlerInput);
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: userTimeZone }),
  );
  let prayerNameDetails = prayerNames
    .map((prayer, index) => {
      const prayerTime = mosqueTimes.times[index];
      if (prayerTime) {
        const prayerDetails = generateNextPrayerTime(
          requestAttributes,
          prayerTime,
          moment(currentDateTime),
          prayer,
          undefined,
          userTimeZone,
        );
        console.log("Prayer Details for %s: ", prayer, prayerDetails);
        const time = prayerDetails.time.format("HH:mm");
        const prayerName = prayerNamesForApl[index];
        return {
          primaryText: prayerName,
          time: time,
          name: prayerName,
          namePhoneme: prayer,
          canonicalName: CANONICAL_PRAYER_NAMES[index],
        };
      }
    })
    .filter((detail) => detail !== undefined && detail !== null);
  if (routinePrayers?.length > 0) {
    prayerNameDetails = prayerNameDetails.filter((detail) => {
      return !routinePrayers
        .map((prayer) => prayer.name.toLowerCase())
        .includes(detail.name.toLowerCase());
    });
  }
  // Extract only the Jumu'ah times
  // const jumuaTimes = [
  //   mosqueTimes.jumua,
  //   mosqueTimes.jumua2,
  //   mosqueTimes.jumua3,
  // ];
  // // Find the first non-null Jumu'ah time
  // const firstNonNullJumua = jumuaTimes.filter(
  //   (time) => time !== null && time !== undefined,
  // );
  // if (firstNonNullJumua.length > 0) {
  //   firstNonNullJumua.forEach((jumuaTime) => {
  //     const prayerName = prayerNamesForApl[JUMUA_PRAYER_INDEX];
  //     prayerNameDetails.push({
  //       primaryText: `${prayerName} ${jumuaTime}`,
  //       time: jumuaTime,
  //       name: prayerName,
  //       namePhoneme: prayerNames[JUMUA_PRAYER_INDEX],
  //     });
  //   });
  // }
  if (prayerNameDetails.length > 0) {
    prayerNameDetails = [ALL_PRAYERS(handlerInput), ...prayerNameDetails];
  }
  sessionAttributes.prayerNameDetails = prayerNameDetails;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  console.log("Final Prayer Name Details: ", JSON.stringify(prayerNameDetails));
  return prayerNameDetails;
}

const saveRequestedRoutinePrayer = async (handlerInput, prayerDetails) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  sessionAttributes.persistentAttributes.requestedRoutinePrayer = prayerDetails;
  attributesManager.setSessionAttributes(sessionAttributes);
};

const deleteRequestedRoutinePrayer = async (handlerInput) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  delete sessionAttributes?.persistentAttributes?.requestedRoutinePrayer;
  attributesManager.setSessionAttributes(sessionAttributes);
};

const getRequestedRoutinePrayer = (handlerInput) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  return sessionAttributes?.persistentAttributes?.requestedRoutinePrayer;
};

const checkForRoutinePrayerAlreadyExists = async (
  handlerInput,
  prayerDetails,
) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const { persistentAttributes } = sessionAttributes;
  const existingRoutines = persistentAttributes.routinePrayers || [];
  if (existingRoutines.length === 0) {
    return false;
  }
  const index = existingRoutines.findIndex(
    (routine) =>
      (routine.canonicalName &&
        prayerDetails.canonicalName &&
        routine.canonicalName === prayerDetails.canonicalName) ||
      routine.name === prayerDetails.name,
  );

  if (index !== -1) {
    // Found a routine with the same name
    if (existingRoutines[index].time === prayerDetails.time) {
      // Name and time both match - routine already exists
      return true;
    } else {
      // Name matches but time is different - remove the old routine
      existingRoutines.splice(index, 1);
      return false;
    }
  }
  // Update persistent attributes
  persistentAttributes.routinePrayers = existingRoutines;
  sessionAttributes.persistentAttributes = persistentAttributes;
  attributesManager.setPersistentAttributes(persistentAttributes);
  attributesManager.setSessionAttributes(sessionAttributes);
  await attributesManager.savePersistentAttributes();

  // No routine with this name exists
  return false;
};

const logRoutineCreation = async (
  handlerInput,
  routineDetails,
  prayerNameDetails = [],
) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const { persistentAttributes } = sessionAttributes;
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  if (
    persistentAttributes.routinePrayers &&
    persistentAttributes.routinePrayers.length > 0
  ) {
    const index = persistentAttributes.routinePrayers.findIndex(
      (routine) => routine.name === routineDetails.name,
    );
    if (index !== -1) {
      // Found a routine with the same name
      if (
        persistentAttributes.routinePrayers[index].time === routineDetails.time
      ) {
        // Name and time both match - routine already exists
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t("routineAlreadyEnabled") +
              requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      } else {
        // Name matches but time is different - remove the old routine
        persistentAttributes.routinePrayers.splice(index, 1);
      }
    }
  }
  try {
    const timezone = await getUserTimezone(handlerInput);
    const mosqueId = persistentAttributes.uuid;
    if (routineDetails.name !== requestAttributes.t("allPrayers")) {
      prayerNameDetails = [routineDetails];
    } else {
      prayerNameDetails = prayerNameDetails.filter(
        (prayer) => prayer.name !== requestAttributes.t("allPrayers"),
      );
    }
    let speakOutput = "";
    if (prayerNameDetails.length > 1) {
      speakOutput = requestAttributes.t("routinesCreatedPrompt");
    } else {
      speakOutput = requestAttributes.t("routineCreatedPrompt");
    }
    for (const prayer of prayerNameDetails) {
      const prayerNameForSchedule = prayer.canonicalName || prayer.name;
      const time = prayer.time;
      console.log("Mosque ID: ", mosqueId);
      console.log("Prayer Name (Schedule): ", prayerNameForSchedule);
      console.log("Time: ", time);
      console.log("Timezone: ", timezone);
      if (
        mosqueId &&
        prayerNameForSchedule &&
        time &&
        timezone &&
        time.toString().length > 0
      ) {
        await eventBridgeScheduler.createOrUpdateSchedule({
          mosqueId,
          prayerName: prayerNameForSchedule,
          time,
          timezone,
        });
      }
    }
    if (!persistentAttributes.routinePrayers) {
      persistentAttributes.routinePrayers = [];
    }
    persistentAttributes.routinePrayers = [
      ...persistentAttributes.routinePrayers,
      ...prayerNameDetails,
    ];
    persistentAttributes.routinePrayers.sort((a, b) => {
      const timeA = moment(a.time, "HH:mm");
      const timeB = moment(b.time, "HH:mm");
      return timeA.diff(timeB);
    });
    attributesManager.setPersistentAttributes(persistentAttributes);
    attributesManager.setSessionAttributes(sessionAttributes);
    await attributesManager.savePersistentAttributes();
    console.log("Routine created successfully");
    return handlerInput.responseBuilder
      .speak(speakOutput + requestAttributes.t("doYouNeedAnythingElsePrompt"))
      .withShouldEndSession(false)
      .getResponse();
  } catch (error) {
    console.log("Error in logRoutineCreation:", error);
    if (error?.message === "Unable to fetch user timezone") {
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("timezoneErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("routineErrorPrompt"))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const getApiEndpoint = (handlerInput) => {
  return handlerInput.requestEnvelope.context?.System?.apiEndpoint;
};

const getPackageId = (handlerInput) => {
  return (
    handlerInput.requestEnvelope.request?.payload?.packageId ||
    handlerInput.requestEnvelope.request?.packageId
  );
};

const getAplArgument = (handlerInput, argument) => {
  return handlerInput.requestEnvelope.request?.arguments?.[argument];
};

const isNewSession = (handlerInput) => {
  return handlerInput.requestEnvelope?.session?.new;
};

const getAccessToken = (handlerInput) => {
  return handlerInput.requestEnvelope?.context?.System?.user?.accessToken;
};

const validateUserAccountStatus = async (handlerInput) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  const accessToken = getAccessToken(handlerInput);

  if (!accessToken) {
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("linkAccountPrompt"))
      .withLinkAccountCard()
      .getResponse();
  }

  try {
    const userInfo = await authHandler.getUserInfo(accessToken);

    if (!userInfo?.email || !userInfo?.user_id) {
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("refreshTokenMissing"))
        .withLinkAccountCard()
        .getResponse();
    }

    const azanUserInfo = await dbHandler.GetAzanUserInfo(userInfo.user_id);

    if (!azanUserInfo?.refresh_token || !azanUserInfo?.endpointId) {
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("refreshTokenMissing"))
        .withLinkAccountCard()
        .getResponse();
    }

    // Validation passed
    return false;
  } catch (error) {
    console.error("Error in validateUserAccountStatus:", error);
    // On error, safest to assume validation failed or return generic error
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("refreshTokenMissing"))
      .withLinkAccountCard()
      .getResponse();
  }
};

const deleteRoutine = async (handlerInput, routineName) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const { persistentAttributes } = sessionAttributes;
  const requestAttributes = attributesManager.getRequestAttributes();
  if (routineName === requestAttributes.t("allPrayers")) {
    delete persistentAttributes.routinePrayers;
    attributesManager.setPersistentAttributes(persistentAttributes);
    attributesManager.setSessionAttributes(sessionAttributes);
    await attributesManager.savePersistentAttributes();
    return true;
  }

  if (persistentAttributes?.routinePrayers?.length > 0) {
    const index = persistentAttributes.routinePrayers.findIndex(
      (routine) =>
        routine.canonicalName === routineName || routine.name === routineName,
    );
    if (index !== -1) {
      persistentAttributes.routinePrayers.splice(index, 1);
      attributesManager.setPersistentAttributes(persistentAttributes);
      attributesManager.setSessionAttributes(sessionAttributes);
      await attributesManager.savePersistentAttributes();
      return true;
    }
  }
  return false;
};
const updateRoutinePrayers = async (handlerInput) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const mosqueTimes = sessionAttributes.mosqueTimes;
  const { persistentAttributes } = sessionAttributes;
  const requestAttributes = attributesManager.getRequestAttributes();
  const routinePrayers = persistentAttributes.routinePrayers;
  if (routinePrayers && routinePrayers.length > 0) {
    const prayerNames = requestAttributes.t("prayerNames");
    // Remove SSML tags from prayer names for comparison
    const cleanPrayerNames = extractPhonemeText(prayerNames);

    routinePrayers.forEach((routine) => {
      // Find matching prayer name using canonical name if available, else clean names
      const prayerIndex = CANONICAL_PRAYER_NAMES.findIndex(
        (cn) => routine.canonicalName && cn === routine.canonicalName,
      );

      const finalIndex =
        prayerIndex !== -1
          ? prayerIndex
          : cleanPrayerNames.findIndex(
              (p) => p.toLowerCase() === routine.name.toLowerCase(),
            );

      if (finalIndex !== -1) {
        if (finalIndex < 5 && mosqueTimes?.times?.[finalIndex]) {
          routine.time = mosqueTimes.times[finalIndex];
        }
      }
    });
    attributesManager.setPersistentAttributes(persistentAttributes);
    await attributesManager.savePersistentAttributes();
  }
};

const isTaskTrigger = (handlerInput) => {
  return handlerInput.requestEnvelope.request?.targetURI?.includes(
    "AMAZON.Launch",
  );
};

const ALL_PRAYERS = (handlerInput) => {
  const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
  return {
    name: requestAttributes.t("allPrayers"),
    time: "",
    namePhoneme: requestAttributes.t("allPrayers"),
    primaryText: requestAttributes.t("allPrayers"),
  };
};

const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/**
 * Resolve the user's preferred distance system ("METRIC" | "IMPERIAL") from the
 * Alexa device settings. Falls back to a locale-based default when the setting
 * is unavailable (en-US uses imperial, everything else metric).
 */
const getUserDistanceUnits = async (handlerInput) => {
  const { serviceClientFactory, requestEnvelope } = handlerInput;
  const deviceId = Alexa.getDeviceId(requestEnvelope);
  try {
    const units = await serviceClientFactory
      .getUpsServiceClient()
      .getSystemDistanceUnits(deviceId);
    return units === "IMPERIAL" ? "IMPERIAL" : "METRIC";
  } catch (error) {
    console.log("Error in fetching distance units, using default: ", error);
    const locale = Alexa.getLocale(requestEnvelope) || "";
    return locale.toLowerCase() === "en-us" ? "IMPERIAL" : "METRIC";
  }
};

/**
 * Format a raw distance (in meters) into a fully localized string including the
 * unit word, e.g. "9,6 kilomètres" (fr-FR), "800 meters" or "5.3 miles".
 *
 * Uses Intl.NumberFormat so the decimal separator (',' vs '.'), pluralization
 * and unit translation follow the locale natively. Short distances are rendered
 * in the smaller unit with no decimals (< 1 km -> meters, < 1 mile -> feet).
 */
function formatDistance(meters, locale = "en-US", units = "METRIC") {
  const distanceInMeters = parseFloat(meters);
  if (!Number.isFinite(distanceInMeters)) {
    return "";
  }

  let value;
  let unit;
  let maximumFractionDigits;

  if (units === "IMPERIAL") {
    if (distanceInMeters < METERS_PER_MILE) {
      value = Math.round(distanceInMeters * FEET_PER_METER);
      unit = "foot";
      maximumFractionDigits = 0;
    } else {
      value = distanceInMeters / METERS_PER_MILE;
      unit = "mile";
      maximumFractionDigits = 1;
    }
  } else if (distanceInMeters < METERS_PER_KM) {
    value = Math.round(distanceInMeters);
    unit = "meter";
    maximumFractionDigits = 0;
  } else {
    value = distanceInMeters / METERS_PER_KM;
    unit = "kilometer";
    maximumFractionDigits = 1;
  }

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "long",
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format a "HH:mm" (24h) time string for the given locale, letting Intl pick the
 * separator and 12h/24h convention natively (e.g. "9:05 PM" for en-US, "21:05"
 * for fr-FR). Falls back to the raw input if it can't be parsed.
 *
 * NB: this is display/speech only — internal logic keeps the raw "HH:mm" form.
 */
function formatTime(time, locale = "en-US") {
  if (typeof time !== "string") {
    return time;
  }
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return time;
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

module.exports = {
  getPersistedData,
  checkForConsentTokenToAccessDeviceLocation,
  createDirectivePayload,
  getNextPrayerTime,
  getPrayerTimingsForMosque,
  getListOfMosque,
  checkForPersistenceData,
  createResponseDirectiveForMosqueList,
  getListOfMosqueBasedOnCity,
  getResolvedValue,
  getResolvedId,
  getUserTimezone,
  calculateMinutes,
  getPrayerTimeForSpecificPrayer,
  getTomorrowPrayerTimes,
  getTomorrowIqamaTimes,
  hasPrayerTimePassed,
  generateNextPrayerTime,
  translateText,
  callDirectiveService,
  splitLanguage,
  createDataSourceForPrayerTiming,
  checkForCharacterDisplay,
  getSlotValues,
  getIntentName,
  getAllPrayerTimesSpeechoutput,
  offerAutomation,
  extractPhonemeText,
  generateRoutineErrorMessage,
  smartEscapeSSML,
  generatePrayerNameDetailsForRoutine,
  saveRequestedRoutinePrayer,
  getRequestedRoutinePrayer,
  deleteRequestedRoutinePrayer,
  checkForRoutinePrayerAlreadyExists,
  logRoutineCreation,
  getApiEndpoint,
  getPackageId,
  getAplArgument,
  isNewSession,
  resolveIqamaMoment,
  getDifferenceInMinutes,
  getAccessToken,
  validateUserAccountStatus,
  deleteRoutine,
  updateRoutinePrayers,
  CANONICAL_PRAYER_NAMES,
  isTaskTrigger,
  ALL_PRAYERS,
  formatDistance,
  getUserDistanceUnits,
  formatTime,
};
