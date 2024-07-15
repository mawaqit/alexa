const Alexa = require("ask-sdk-core");
const { v4: uuidv4 } = require("uuid");
const { getMosqueList } = require("./handlers/apiHandler.js");
const {
  getDataSourceforMosqueList,
  getDatSourceForPrayerTime,
} = require("./datasources.js");
const mosqueListApl = require("./aplDocuments/mosqueListApl.json");
const moment = require("moment-timezone");
const prayerTimeApl = require("./aplDocuments/prayerTimeApl.json");

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
    handlerInput.requestEnvelope.context.System.user.permissions &&
    handlerInput.requestEnvelope.context.System.user.permissions.consentToken
  );
};

const createDirectivePayload = (aplDocument, dataSources = {}) => {
  return {
    type: "Alexa.Presentation.APL.RenderDocument",
    token: uuidv4(),
    document: aplDocument,
    datasources: dataSources,
  };
};

const getNextPrayerTime = (times, timezone, prayerNames) => {
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone })
  );
  // Get the current moment object with time zone information
  const now = moment(currentDateTime);
  console.log("Now: ", JSON.stringify(now));

  // Parse times into moment objects (assuming times are in your current time zone)
  const timeMoments = times.map((time, index) => {
    const [hours, minutes] = time.split(":");
    const currentMoment = now.format("YYYY-MM-DDTHH:mm");
    const timeMoment = `${now.format("YYYY-MM-DD")}T${hours}:${minutes}`;
    return {
      name: prayerNames[index],
      time: moment(timeMoment),
      diffInMinutes: calculateMinutes(currentMoment, timeMoment),
    };
  });
  console.log("Time Moments: ", timeMoments);
  // Find the first time greater than or equal to current time (considering time zone)
  const nextTime = timeMoments.find(({ time }) => time.isSameOrAfter(now));
  console.log("Next Time: ", nextTime);
  if (nextTime && nextTime) {
    console.log(
      "The first time greater than or equal to current time is:",
      nextTime
    );
    return {
      name: nextTime.name,
      time: nextTime.time.format("HH:mm"),
      diffInMinutes: nextTime.diffInMinutes,
    };
  } else {
    console.log("No time is greater than or equal to current time: ", times[0]);
    return {
      name: prayerNames[0],
      time: times[0],
      diffInMinutes: calculateMinutes(
        now.format("YYYY-MM-DDTHH:mm"),
        `${now.add(1, "days").format("YYYY-MM-DD")}T${times[0]}`
      ),
    };
  }
};

const checkForPersistenceData = async (handlerInput) => {
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const { persistentAttributes, mosqueTimes } = sessionAttributes;
  console.log("Persisted Data: ", persistentAttributes);
  if (persistentAttributes) {
    return await getPrayerTimingsForMosque(handlerInput, mosqueTimes);
  }
  return await getListOfMosque(handlerInput);
};

const getPrayerTimingsForMosque = async (
  handlerInput,
  mosqueTimes,
  speakOutput
) => {
  const { responseBuilder, attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const persistedData =
    attributesManager.getSessionAttributes().persistentAttributes;
  if (!speakOutput) {
    speakOutput = requestAttributes.t("welcomePrompt");
  }
  try {
    const userTimeZone = await getUserTimezone(handlerInput);
    const prayerNames = requestAttributes.t("prayerNames");
    const nextPrayerTime = getNextPrayerTime(
      mosqueTimes.times,
      userTimeZone,
      prayerNames
    );
    speakOutput += requestAttributes.t(
      "nextPrayerTimePrompt",
      persistedData.primaryText,
      nextPrayerTime.name,
      nextPrayerTime.time,
      nextPrayerTime.diffInMinutes
    );
    return responseBuilder.speak(speakOutput).getResponse();
  } catch (error) {
    console.log("Error in fetching prayer timings: ", error);
    if (error === "Mosque not found") {
      return await getListOfMosque(handlerInput);
    }
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const getListOfMosque = async (handlerInput) => {
  const { requestEnvelope, responseBuilder, attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const isGeolocationSupported =
    Alexa.getSupportedInterfaces(requestEnvelope)["Geolocation"];
  if (!isGeolocationSupported) {
    const consentToken =
      checkForConsentTokenToAccessDeviceLocation(handlerInput);
    if (!consentToken) {
      return responseBuilder
        .speak(requestAttributes.t("requestForGeoLocationPrompt"))
        .withAskForPermissionsConsentCard(["read::alexa:device:all:address"])
        .getResponse();
    }
    return await getListOfMosqueBasedOnCity(handlerInput);
  }
  return await getListOfMosqueBasedOnGeoLocation(handlerInput);
};

const getListOfMosqueBasedOnGeoLocation = async (handlerInput) => {
  const { requestEnvelope, responseBuilder, attributesManager } = handlerInput;
  const geoObject = requestEnvelope.context.Geolocation;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const requestAttributes = attributesManager.getRequestAttributes();
  if (!geoObject || !geoObject.coordinate) {
    return responseBuilder
      .speak(requestAttributes.t("requestForGeoLocationPrompt"))
      .withAskForPermissionsConsentCard(["alexa::devices:all:geolocation:read"])
      .getResponse();
  } else {
    console.log("Location data: ", JSON.stringify(geoObject));
    const { coordinate } = geoObject;
    const { latitudeInDegrees, longitudeInDegrees } = coordinate;
    try {
      const mosqueList = await getMosqueList(
        null,
        latitudeInDegrees,
        longitudeInDegrees
      );
      sessionAttributes.mosqueList = mosqueList;
      attributesManager.setSessionAttributes(sessionAttributes);
      return createResponseDirectiveForMosqueList(handlerInput, mosqueList);
    } catch (error) {
      console.log("Error in fetching mosque list: ", error);
      return responseBuilder
        .speak(requestAttributes.t("errorPromptforMosqueList"))
        .withShouldEndSession(true)
        .getResponse();
    }
  }
};

const getListOfMosqueBasedOnCity = async (handlerInput) => {
  const {
    requestEnvelope,
    serviceClientFactory,
    responseBuilder,
    attributesManager,
  } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const sessionAttributes = attributesManager.getSessionAttributes();
  try {
    const deviceId = Alexa.getDeviceId(requestEnvelope);
    const deviceAddressServiceClient =
      serviceClientFactory.getDeviceAddressServiceClient();
    const address = await deviceAddressServiceClient.getFullAddress(deviceId);
    console.log(
      "Address successfully retrieved, now responding to user : ",
      address
    );
    const { city } = address;

    if (city === null || !city.length) {
      return responseBuilder
        .speak(requestAttributes.t("noAddressPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
    const mosqueList = await getMosqueList(city);
    sessionAttributes.mosqueList = mosqueList;
    attributesManager.setSessionAttributes(sessionAttributes);
    return createResponseDirectiveForMosqueList(handlerInput, mosqueList);
  } catch (error) {
    console.log("Error in retrieving address: ", error);
    return responseBuilder
      .speak(requestAttributes.t("errorPromptforMosqueList"))
      .withShouldEndSession(true)
      .getResponse();
  }
};

const createResponseDirectiveForMosqueList = (
  handlerInput,
  mosqueList,
  speechPrompt
) => {
  const { responseBuilder, attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  if (!speechPrompt) {
    speechPrompt =
      requestAttributes.t("welcomePrompt") +
      requestAttributes.t("mosqueNotRegisteredPrompt");
  }
  responseBuilder.addDirective({
    type: "Dialog.ElicitSlot",
    slotToElicit: "selectedMosque",
    updatedIntent: {
      name: "SelectMosqueIntent",
      confirmationStatus: "NONE",
      slots: {
        searchWord: {
          name: "searchWord",
          confirmationStatus: "NONE",
        },
        selectedMosque: {
          name: "selectedMosque",
          confirmationStatus: "NONE",
        },
      },
    },
  });
  if (
    Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
      "Alexa.Presentation.APL"
    ]
  ) {
    const dataSource = getDataSourceforMosqueList(handlerInput, mosqueList);
    console.log("Data Source: ", JSON.stringify(dataSource));
    const aplDirective = createDirectivePayload(mosqueListApl, dataSource);
    responseBuilder.addDirective(aplDirective);
  }
  console.log("Mosque List: ", mosqueList);
  const mosqueListPrompt = mosqueList
    .map((mosque) => mosque.primaryText)
    .map((primaryText, index) => `${index + 1}. ${primaryText}`)
    .join(", ");
  console.log("Mosque List Prompt: ", mosqueListPrompt);
  speechPrompt += requestAttributes.t("chooseMosquePrompt", mosqueListPrompt);
  return responseBuilder.speak(speechPrompt).getResponse();
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
      return "America/Los_Angeles";
    });
  return userTimeZone;
};

function calculateMinutes(start, end) {
  // Create Date objects from the input strings
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Calculate the difference in milliseconds
  const diffInMilliseconds = endDate - startDate;

  // Convert the difference to minutes
  const diffInMinutes = diffInMilliseconds / 1000 / 60;

  let result;

  if (diffInMinutes >= 60) {
    const hours = Math.floor(diffInMinutes / 60);
    const minutes = Math.floor(diffInMinutes % 60);
    result = `${hours} hours and ${minutes} minutes`;
  } else if (diffInMinutes < 1) {
    const diffInSeconds = diffInMilliseconds / 1000;
    result = `${diffInSeconds} seconds`;
  } else {
    result = `${diffInMinutes} minutes`;
  }

  return result;
}

//Provides resolved slot value
function getResolvedValue(requestEnvelope, slotName) {
  if (
    requestEnvelope &&
    requestEnvelope.request &&
    requestEnvelope.request.intent &&
    requestEnvelope.request.intent.slots &&
    requestEnvelope.request.intent.slots[slotName] &&
    requestEnvelope.request.intent.slots[slotName].resolutions &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0] &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0] &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0].value &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0].value.name
  ) {
    return requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0].value.name;
  }
  return undefined;
}

//Provides resolved slot id
function getResolvedId(requestEnvelope, slotName) {
  if (
    requestEnvelope &&
    requestEnvelope.request &&
    requestEnvelope.request.intent &&
    requestEnvelope.request.intent.slots &&
    requestEnvelope.request.intent.slots[slotName] &&
    requestEnvelope.request.intent.slots[slotName].resolutions &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0] &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0] &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0].value &&
    requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0].value.id
  ) {
    return requestEnvelope.request.intent.slots[slotName].resolutions
      .resolutionsPerAuthority[0].values[0].value.id;
  }
  return undefined;
}

const getPrayerTimeForSpecificPrayer = (
  handlerInput,
  nameOfMosque,
  prayerTime,
  currentMoment,
  now,
  prayerName
) => {
  try {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const [hours, minutes] = prayerTime.split(":");
    const timeMoment = moment(
      `${now.format("YYYY-MM-DD")}T${hours}:${minutes}`
    );
    const timeDifference = timeMoment.isSameOrAfter(currentMoment)
      ? moment.duration(timeMoment.diff(currentMoment))
      : moment.duration(timeMoment.add(1, "days").diff(currentMoment));
    const hoursDiff = timeDifference.hours();
    const minutesDiff = timeDifference.minutes();
    let speakOutput;
    if (minutesDiff < 59 && hoursDiff < 1) {
      speakOutput = requestAttributes.t("minutesPrompt", minutesDiff);
    } else {
      speakOutput = requestAttributes.t(
        "hoursAndMinutesPrompt",
        hoursDiff,
        minutesDiff
      );
    }
    return handlerInput.responseBuilder
      .speak(
        requestAttributes.t(
          "nextPrayerTimeWithNamePrompt",
          nameOfMosque,
          prayerName,
          prayerTime,
          speakOutput
        )
      )
      .withShouldEndSession(false)
      .getResponse();
  } catch (error) {
    console.log("Error in fetching prayer time for specific prayer: ", error);
    return handlerInput.responseBuilder
      .speak(
        "Sorry, I am unable to fetch the prayer time for the specific prayer."
      )
      .withShouldEndSession(true)
      .getResponse();
  }
};

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
};
