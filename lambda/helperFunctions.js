const Alexa = require("ask-sdk-core");
const { v4: uuidv4 } = require("uuid");
const { getMosqueList } = require("./handlers/apiHandler.js");
const { getDataSourceforMosqueList } = require("./datasources.js");
const mosqueListApl = require("./aplDocuments/mosqueListApl.json");
const moment = require("moment-timezone");
const { getLatLng } = require("./handlers/googleGeoApiHandler.js");
const { translate, detectLanguage } = require('./handlers/googleTranslateHandler.js');
const prayerTimeApl = require("./aplDocuments/characterDisplayApl.json");
const SKILL_ID = process.env.mawaqitAlexaSkillId || "amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506";

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
    handlerInput.requestEnvelope.context.System.user.permissions?.consentToken 
    && handlerInput.requestEnvelope.context.System?.apiAccessToken
  );
};

const createDirectivePayload = (aplDocument, dataSources = {}, type = "Alexa.Presentation.APL.RenderDocument") => {
  return {
    type: type,
    token: uuidv4(),
    document: aplDocument,
    datasources: dataSources,
  };
};

const getNextPrayerTime = (requestAttributes, times, timezone, prayerNames, iqamaTime = []) => {
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone })
  );
  // Get the current moment object with time zone information
  const now = moment(currentDateTime);
  console.log("Now: ", JSON.stringify(now));

  // Parse times into moment objects (assuming times are in your current time zone)
  const timeMoments = times.map((time, index) => generateNextPrayerTime(requestAttributes, time, now, prayerNames[index], iqamaTime[index]));
  console.log("Time Moments: ", timeMoments);
  // Find the first time greater than or equal to current time (considering time zone)
  const nextTime = timeMoments.find(({ time }) => time.isSameOrAfter(now));
  console.log("Next Time: ", nextTime);
  if (nextTime) {
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
        requestAttributes,
        now.format("YYYY-MM-DDTHH:mm"),
        `${moment(now).add(1, "days").format("YYYY-MM-DD")}T${times[0]}`
      ),
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
  const isLaunchRequest = Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
  if (isLaunchRequest) {
    console.log("No persistent data found, prompting user to select mosque.");
    const speakOutput = requestAttributes.t("thankYouPrompt") + requestAttributes.t("mosqueNotRegisteredPrompt") + requestAttributes.t("selectMosquePrompt");
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  }
  return await getListOfMosque(handlerInput, requestAttributes.t("thankYouPrompt") + requestAttributes.t("mosqueNotRegisteredPrompt"));
};

const getPrayerTimingsForMosque = async (
  handlerInput,
  mosqueTimes,
  speakOutput
) => {
  const { attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const persistedData =
    attributesManager.getSessionAttributes().persistentAttributes;
  try {
    const userTimeZone = await getUserTimezone(handlerInput);
    const prayerNames = requestAttributes.t("prayerNames");
    const nextPrayerTime = getNextPrayerTime(
      requestAttributes,
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
    checkForCharacterDisplay(handlerInput, nextPrayerTime.time);
    return handlerInput.responseBuilder.speak(speakOutput).withShouldEndSession(false).getResponse();
  } catch (error) {
    console.log("Error in fetching prayer timings: ", error);
    if (error?.message === "Mosque not found") {
      return await getListOfMosque(handlerInput, speakOutput);
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
        .speak( speakOutput + requestAttributes.t("requestForGeoLocationPrompt"))
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
        longitudeInDegrees
      );
      sessionAttributes.mosqueList = mosqueList;
      attributesManager.setSessionAttributes(sessionAttributes);
      return await createResponseDirectiveForMosqueList(handlerInput, mosqueList, speakOutput);
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
    if(!address){
      return responseBuilder
        .speak(requestAttributes.t("noAddressPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
    console.log(
      "Address successfully retrieved, now responding to user : ",
      address
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
    return await createResponseDirectiveForMosqueList(handlerInput, mosqueList, speakOutput);
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
  speechPrompt
) => {
  const { responseBuilder, attributesManager } = handlerInput;
  const requestAttributes = attributesManager.getRequestAttributes();
  const locale = Alexa.getLocale(handlerInput.requestEnvelope);
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
  mosqueList = await Promise.all(
    mosqueList.map(async (mosque) => {
      mosque.primaryText = await translateText(mosque.primaryText, locale);  
      return mosque;
    })
  )
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
    const dataSource = await getDataSourceforMosqueList(handlerInput, mosqueList);
    console.log("Data Source: ", JSON.stringify(dataSource));
    const aplDirective = createDirectivePayload(mosqueListApl, dataSource);
    responseBuilder.addDirective(aplDirective);
    speechPrompt += requestAttributes.t("chooseMosqueByTouchPrompt");
  }
  return responseBuilder.speak(speechPrompt).withShouldEndSession(false).getResponse();
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

function checkForCharacterDisplay(handlerInput, nextPrayerTime) {
  if (Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)["Alexa.Presentation.APLT"]) {
    const dataSource = createDataSourceForPrayerTiming(nextPrayerTime);
    const aplDirective = createDirectivePayload(prayerTimeApl, dataSource, "Alexa.Presentation.APLT.RenderDocument");
    handlerInput.responseBuilder.addDirective(aplDirective);
  }
}

function calculateMinutes(requestAttributes, start, end) {
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
    result = requestAttributes.t("hoursAndMinutesPrompt", hours, minutes);
  } else if (diffInMinutes < 1) {
    const diffInSeconds = Math.floor(diffInMilliseconds / 1000);
    result = requestAttributes.t("secondsPrompt", diffInSeconds);
  } else {
    result = requestAttributes.t("minutesPrompt", diffInMinutes);
  }
  return result;
}

//Provides resolved slot value
function getResolvedValue(requestEnvelope, slotName) {
  return requestEnvelope?.request?.intent?.slots?.[slotName]
    ?.resolutions?.resolutionsPerAuthority?.[0]
    ?.values?.[0]?.value?.name;
}

//Provides resolved slot id
function getResolvedId(requestEnvelope, slotName) {
  return requestEnvelope?.request?.intent?.slots?.[slotName]
    ?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.id;
}

const getPrayerTimeForSpecificPrayer = (
  handlerInput,
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
    if (minutesDiff <= 59 && hoursDiff < 1) {
      speakOutput = requestAttributes.t("minutesPrompt", minutesDiff);
    } else {
      speakOutput = requestAttributes.t(
        "hoursAndMinutesPrompt",
        hoursDiff,
        minutesDiff
      );
    }
    checkForCharacterDisplay(handlerInput, prayerTime);
    return handlerInput.responseBuilder
      .speak(
        requestAttributes.t(
          "nextPrayerTimeWithNamePrompt",
          prayerName,
          prayerTime,
          speakOutput
        ) + requestAttributes.t("doYouNeedAnythingElsePrompt")
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

const generateNextPrayerTime = (requestAttributes, prayerTime, now, prayerName, iqamaTime) => {
  const currentMoment = now.format("YYYY-MM-DDTHH:mm");
  const timeMoment = resolveIqamaMoment(iqamaTime, now, prayerTime);
  return {
    name: prayerName,
    time: timeMoment,
    diffInMinutes: calculateMinutes(
      requestAttributes,
      currentMoment,
      timeMoment.format("YYYY-MM-DDTHH:mm")
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
  return moment(now).set("hour", parseInt(hours)).set("minute", parseInt(minutes));
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
    console.log("Error in converting %s to %s: %s", text,toLang, error);
    return text;
  }
}

async function callDirectiveService(handlerInput, speakOutput) {
  console.log("Call Directive Service");
  try {
    const requestEnvelope = handlerInput.requestEnvelope;
    const directiveServiceClient = handlerInput.serviceClientFactory.getDirectiveServiceClient();

    const requestId = requestEnvelope.request.requestId;
    const directive = {
      header: {
        requestId,
      },
      directive: {
        type: 'VoicePlayer.Speak',
        speech: speakOutput,
      },
    };

    return await directiveServiceClient.enqueue(directive);
  } catch (error) {
    console.error('Error calling directive service:', error);
    // Continue skill flow without progressive response
    return Promise.resolve();
  }
}

const splitLanguage = (locale) => {
  return locale.split("-")[0];
}

const createDataSourceForPrayerTiming = (time) => {
  return {
    "data": {
        "text": time
    }
}
}

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
  console.log("User Timezone: ", userTimeZone);
  const prayerNames = requestAttributes.t("prayerNames");
  let allPrayerTimes = "";
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: userTimeZone })
  );
  prayerNames.forEach((prayer, index) => {
    const prayerTime = mosqueTimes.times[index];
    if (prayerTime) {
      const prayerDetails = generateNextPrayerTime(
        requestAttributes,
        prayerTime,
        moment(currentDateTime),
        prayer
      );
      console.log("Prayer Details for %s: ", prayer, prayerDetails);
      allPrayerTimes += requestAttributes.t(
        "allPrayerTimesPrompt",
        prayer,
        prayerDetails.time.format("HH:mm")
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
                :
                "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=SU,MO,TU,WE,TH,FR,SA",
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
                    input: {}
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
    if (typeof phoneme !== 'string') return phoneme;
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
  if (!ssml) return '';

  // Step 1: Escape ampersands not already part of entities
  ssml = ssml.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');

  // Step 2: Escape < and > only if they're outside of tag brackets
  // Split the SSML by tags and escape only the text segments
  return ssml
    .split(/(<[^>]+>)/g) // keep tags separate
    .map(segment => {
      if (segment.startsWith('<')) return segment; // it's a tag — keep as is
      // escape stray < and > in text only
      return segment.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    })
    .join('');
}

async function generatePrayerNameDetailsForRoutine(handlerInput) {
  const JUMUA_PRAYER_INDEX = 5;
  const { attributesManager } = handlerInput;
  const sessionAttributes = attributesManager.getSessionAttributes();
  const requestAttributes = attributesManager.getRequestAttributes();
  const mosqueTimes = sessionAttributes.mosqueTimes;
  console.log("Mosque Times: ", JSON.stringify(mosqueTimes));
  const prayerNames = requestAttributes.t("prayerNames");
  const prayerNamesForApl = extractPhonemeText(prayerNames);
  const userTimeZone = await getUserTimezone(handlerInput);
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: userTimeZone })
  );
  const prayerNameDetails = prayerNames
    .map((prayer, index) => {
      const prayerTime = mosqueTimes.times[index];
      if (prayerTime) {
        const prayerDetails = generateNextPrayerTime(
          requestAttributes,
          prayerTime,
          moment(currentDateTime),
          prayer
        );
        console.log("Prayer Details for %s: ", prayer, prayerDetails);
        const time = prayerDetails.time.format("HH:mm");
        const prayerName = prayerNamesForApl[index];
        return {
          primaryText: prayerName + " " + time,
          time: time,
          name: prayerName,
          namePhoneme: prayer,
        };
      }
    })
    .filter((detail) => detail !== undefined && detail !== null);
  // Extract only the Jumu'ah times
  const jumuaTimes = [
    mosqueTimes.jumua,
    mosqueTimes.jumua2,
    mosqueTimes.jumua3,
  ];
  // Find the first non-null Jumu'ah time
  const firstNonNullJumua = jumuaTimes.filter(
    (time) => time !== null && time !== undefined
  );
  if (firstNonNullJumua.length > 0) {
    firstNonNullJumua.forEach((jumuaTime) => {
      const prayerName = prayerNamesForApl[JUMUA_PRAYER_INDEX];
      prayerNameDetails.push({
        primaryText: `${prayerName} ${jumuaTime}`,
        time: jumuaTime,
        name: prayerName,
        namePhoneme: prayerNames[JUMUA_PRAYER_INDEX],
      });
    });
  }
  sessionAttributes.prayerNameDetails = prayerNameDetails;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  console.log(
    "Final Prayer Name Details: ",
    JSON.stringify(prayerNameDetails)
  );
  return prayerNameDetails;
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
  generatePrayerNameDetailsForRoutine
};