const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const { getPrayerTimings, getMosqueList } = require("./apiHandler.js");
const moment = require("moment-timezone");
const { getS3PreSignedUrl } = require("./s3Handler.js");
const { getDataSourceforMosqueInfo } = require("../datasources.js");

const SelectMosqueIntentStartedHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SelectMosqueIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "selectedMosque")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    return await helperFunctions.getListOfMosqueBasedOnCity(handlerInput, requestAttributes.t("okPrompt"));
  },
};

const SelectMosqueIntentAfterSelectingMosqueHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "SelectMosqueIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "selectedMosque")
    );
  },
  async handle(handlerInput) {
    const locale = Alexa.getLocale(handlerInput.requestEnvelope);
    const selectedMosque = Alexa.getSlotValue(
      handlerInput.requestEnvelope,
      "selectedMosque"
    );
    console.log("Selected Mosque: ", selectedMosque);
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const mosqueList = sessionAttributes.mosqueList;
    const selectedMosqueDetails = mosqueList[parseInt(selectedMosque) - 1];
    if (!selectedMosqueDetails) {
      return await helperFunctions.createResponseDirectiveForMosqueList(
        handlerInput,
        mosqueList,
        requestAttributes.t("unableToFindMosquePrompt")
      );
    }
    selectedMosqueDetails.primaryText = await helperFunctions.translateText(selectedMosqueDetails.primaryText, locale);
    selectedMosqueDetails.localisation = await helperFunctions.translateText(selectedMosqueDetails.localisation, locale);
    selectedMosqueDetails.proximity = parseInt(selectedMosqueDetails.proximity)/1000;
    console.log("Selected Mosque Details: ", selectedMosqueDetails);
    sessionAttributes.persistentAttributes = selectedMosqueDetails
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    try {
      const mosqueTimes = await getPrayerTimings(selectedMosqueDetails.uuid);
      sessionAttributes.mosqueTimes = mosqueTimes;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return await helperFunctions.getPrayerTimingsForMosque(
        handlerInput,
        mosqueTimes,
        requestAttributes.t(
          "selectedMosquePrompt",
          selectedMosqueDetails.primaryText
        )
      );
    } catch (error) {
      console.log("Error in fetching prayer timings: ", error);
      if (error === "Mosque not found") {
        return await helperFunctions.getListOfMosque(handlerInput, requestAttributes.t("mosqueNotRegisteredPrompt"));
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const NextPrayerTimeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "NextPrayerTimeIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const { persistentAttributes, mosqueTimes } = sessionAttributes;
    if (!persistentAttributes || !persistentAttributes.uuid) {
      return await helperFunctions.checkForPersistenceData(handlerInput);
    }
    const { primaryText } = persistentAttributes;
    const prayerName = Alexa.getSlotValue(
      handlerInput.requestEnvelope,
      "prayerName"
    );
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const mosqueTimesData = mosqueTimes;
    const prayerNameResolvedId = helperFunctions.getResolvedId(
      handlerInput.requestEnvelope,
      "prayerName"
    );
    console.log("Prayer Name Resolved Id: ", prayerNameResolvedId);
    const prayerNameFromData = requestAttributes.t("prayerNames")[parseInt(prayerNameResolvedId)];
    console.log("Prayer Name: ", prayerName);
    const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
    const currentDateTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: userTimeZone })
    );
    const now = moment(currentDateTime);
    const currentMoment = moment(now.format("YYYY-MM-DDTHH:mm"));
    console.log("Now: ", JSON.stringify(now));
    console.log("Prayer Name From Data: ", prayerNameFromData);
    if (parseInt(prayerNameResolvedId) < 5) {
      const timeForNextPrayer =
        mosqueTimesData.times[parseInt(prayerNameResolvedId)];
      return helperFunctions.getPrayerTimeForSpecificPrayer(
        handlerInput,
        timeForNextPrayer,
        currentMoment,
        now,
        prayerNameFromData
      );
    }
    switch (parseInt(prayerNameResolvedId)) {
      case 5:
        // Extract only the Jumu'ah times
        const jumuaTimes = [
          mosqueTimesData.jumua,
          mosqueTimesData.jumua2,
          mosqueTimesData.jumua3,
        ];
        // Find the first non-null Jumu'ah time
        const firstNonNullJumua = jumuaTimes.filter((time) => time !== null && time !== undefined).join(", ");
        if (firstNonNullJumua) {
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t(
                "nextPrayerTimeSpecificPrompt",
                primaryText,
                prayerNameFromData,
                firstNonNullJumua
              )
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("noPrayerTimePrompt", prayerNameFromData) + requestAttributes.t("doYouNeedAnythingElsePrompt"))
          .withShouldEndSession(false)
          .getResponse();
      case 6:
        // Extract only the Eid times
        const eidTimes = [
          mosqueTimesData.aidPrayerTime,
          mosqueTimesData.aidPrayerTime2,
        ];
        // Find the first non-null Eid time
        const firstNonNullEid = eidTimes.filter((time) => time !== null && time !== undefined).join(", ");
        if (firstNonNullEid) {
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t(
                "nextPrayerTimeSpecificPrompt",
                primaryText,
                prayerNameFromData,
                firstNonNullEid
              )
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("noPrayerTimePrompt", prayerNameFromData) + requestAttributes.t("doYouNeedAnythingElsePrompt"))
          .withShouldEndSession(false)
          .getResponse();
      case 7:
        const firstNonNullShuruq = mosqueTimesData.shuruq;
        if (firstNonNullShuruq) {
          return helperFunctions.getPrayerTimeForSpecificPrayer(
            handlerInput,
            firstNonNullShuruq,
            currentMoment,
            now,
            prayerNameFromData
          );
        }
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("noPrayerTimePrompt", prayerNameFromData) + requestAttributes.t("doYouNeedAnythingElsePrompt"))
          .withShouldEndSession(false)
          .getResponse();
    }
  },
};

const NextPrayerTimeIntentWithoutNameHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "NextPrayerTimeIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const { persistentAttributes, mosqueTimes } = sessionAttributes;
    const requestAttributes =
    handlerInput.attributesManager.getRequestAttributes();
    if (!persistentAttributes || !persistentAttributes.uuid) {
      return await helperFunctions.checkForPersistenceData(handlerInput);
    }
    const prayerTimeDetails = helperFunctions.getNextPrayerTime(requestAttributes, mosqueTimes.times, await helperFunctions.getUserTimezone(handlerInput), requestAttributes.t("prayerNames"));
    const speakOutput = requestAttributes.t("nextPrayerWithoutMosquePrompt", prayerTimeDetails.name, prayerTimeDetails.time, prayerTimeDetails.diffInMinutes) + requestAttributes.t("doYouNeedAnythingElsePrompt");
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(false)
      .getResponse();
  }
};

const NextIqamaTimeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "NextIqamaTimeIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes || !persistentAttributes.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      const requestAttributes =
        handlerInput.attributesManager.getRequestAttributes();
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      console.log("User Timezone: ", userTimeZone);
      const prayerNames = requestAttributes.t("prayerNames");
      const { iqamaEnabled } =  mosqueTimes;
      if(!iqamaEnabled) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("iqamaNotEnabledPrompt") + requestAttributes.t("doYouNeedAnythingElsePrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }
      const iqamaCalendar = mosqueTimes.iqamaCalendar;
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone })
      );
      const date = currentDateTime.getDate();
      const month = currentDateTime.getMonth();
      const iqamaTimes = iqamaCalendar[month][String(date)];
      console.log("Iqama Times: ", iqamaTimes);
      const nextIqamaTime = helperFunctions.getNextPrayerTime(
        requestAttributes,
        mosqueTimes.times,
        userTimeZone,
        prayerNames,
        iqamaTimes
      );
      console.log("Next Iqama Time: ", nextIqamaTime);
      return handlerInput.responseBuilder
        .speak(
          requestAttributes.t(
            "nextIqamaTimePrompt",
            nextIqamaTime.name,
            nextIqamaTime.diffInMinutes
          ) + requestAttributes.t("doYouNeedAnythingElsePrompt")
        )
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in fetching iqama timings: ", error);
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const PlayAdhanIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "PlayAdhanIntent"
    );
  },
  async handle(handlerInput) {
    const prayerName = helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName");    
    let audioToFetch = "converted-adhan.mp3";
    if(prayerName === "0"){
      audioToFetch = "converted-adhan-fajr.mp3";
    }
    let audioUrl = Alexa.escapeXmlCharacters(await getS3PreSignedUrl(audioToFetch));
    console.log("Audio URL: ", audioUrl);
    let speakOutput = `<audio src='${audioUrl}' />`;
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const MosqueInfoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "MosqueInfoIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes || !persistentAttributes.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      const requestAttributes =
        handlerInput.attributesManager.getRequestAttributes();
      const { primaryText, localisation, proximity, jumua, jumua2, jumua3, image } = persistentAttributes;
      const mosqueInfo = {
        mosqueName: primaryText,
        mosqueDescription: localisation,
        mosqueImage: image,
      }
       // Extract only the Jumu'ah times
       const jumuaTimes = [
        jumua,
        jumua2,
        jumua3,
      ];
      const prayerNames = requestAttributes.t("prayerNames");
      let prayerTimeApl = prayerNames.slice(0,5).map((prayer, index) => {
        const prayerTime = mosqueTimes.times[index];
        return {
          primaryText: `${prayer} ${prayerTime}`,
        };  
      });
      let speakOutput = requestAttributes.t("mosqueInfoPrompt", primaryText, localisation, proximity);
      // Find the first non-null Jumu'ah time
      const firstNonNullJumua = jumuaTimes.filter((time) => time !== null && time !== undefined);
      if(firstNonNullJumua.length > 0) {
        speakOutput += requestAttributes.t("jummaTimePrompt", firstNonNullJumua.join(", "));
        firstNonNullJumua.forEach((jumuaTime, index) => {
          prayerTimeApl.push({
            primaryText: `${prayerNames[5]} ${index+1} ${jumuaTime}`,
          });
        });
      } else {
        speakOutput += requestAttributes.t("noJumuaTime");
        prayerTimeApl.push({
          primaryText: `${prayerNames[5]}  ${requestAttributes.t("none")}`,
        });
      }
      if(mosqueTimes.shuruq){
        prayerTimeApl.push({
          primaryText: `${prayerNames[7]}  ${mosqueTimes.shuruq}`,
        });
      }
      if (
        Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
          "Alexa.Presentation.APL"
        ]
      ) {
        const dataSource = await getDataSourceforMosqueInfo(handlerInput, prayerTimeApl, mosqueInfo);
        console.log("Data Source: ", JSON.stringify(dataSource));
        const aplDirective = helperFunctions.createDirectivePayload(require("../aplDocuments/mosqueInfoApl.json"), dataSource);
        handlerInput.responseBuilder.addDirective(aplDirective);
      }
      return handlerInput.responseBuilder
        .speak(speakOutput + requestAttributes.t("doYouNeedAnythingElsePrompt"))
        .withShouldEndSession(false)
        .getResponse();

    } catch (error) {
      console.log("Error in fetching Mosque Info ", error);
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("mosqueInfoErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const AllIqamaTimeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AllIqamaIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes || !persistentAttributes.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      const requestAttributes =
        handlerInput.attributesManager.getRequestAttributes();
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      console.log("User Timezone: ", userTimeZone);
      const prayerNames = requestAttributes.t("prayerNames");
      const { iqamaEnabled } =  mosqueTimes;
      if(!iqamaEnabled) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("iqamaNotEnabledPrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }
      const iqamaCalendar = mosqueTimes.iqamaCalendar;
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone })
      );
      const date = currentDateTime.getDate();
      const month = currentDateTime.getMonth();
      const iqamaTimes = iqamaCalendar[month][String(date)];
      console.log("Iqama Times: ", iqamaTimes);
      let allIqamaTimes = "";
      prayerNames.forEach((prayer, index) => {
        const iqamaTime = iqamaTimes[index];
        const prayerTime = mosqueTimes.times[index];
        if(prayerTime && iqamaTime){
          const iqamaDetails = helperFunctions.generateNextPrayerTime(requestAttributes, prayerTime, moment(currentDateTime), prayer, iqamaTime);
          console.log("Iqama Details for %s: ",prayer, iqamaDetails);
          allIqamaTimes += requestAttributes.t("allIqamaTimesPrompt", prayer, iqamaDetails.time.format("HH:mm"));
        }
      });

      return handlerInput.responseBuilder
        .speak(allIqamaTimes + requestAttributes.t("doYouNeedAnythingElsePrompt"))
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in fetching iqama timings: ", error);
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const AllPrayerTimeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AllPrayerTimeIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes || !persistentAttributes.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      const requestAttributes =
        handlerInput.attributesManager.getRequestAttributes();
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      console.log("User Timezone: ", userTimeZone);
      const prayerNames = requestAttributes.t("prayerNames");
      let allPrayerTimes = "";
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone })
      );
      prayerNames.forEach((prayer, index) => {
        const prayerTime = mosqueTimes.times[index];
        if(prayerTime){
          const prayerDetails = helperFunctions.generateNextPrayerTime(requestAttributes, prayerTime, moment(currentDateTime), prayer);
          console.log("Prayer Details for %s: ",prayer, prayerDetails);
          allPrayerTimes += requestAttributes.t("allPrayerTimesPrompt", prayer, prayerDetails.time.format("HH:mm"));
        }
      });

      return handlerInput.responseBuilder
        .speak(allPrayerTimes + requestAttributes.t("doYouNeedAnythingElsePrompt"))
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in fetching iqama timings: ", error);
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("nextPrayerTimeErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const DeleteDataIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "DeleteDataIntent"
    );
  },
  async handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return await handlerInput.attributesManager
        .deletePersistentAttributes()
        .then(() => {
          console.log("Data deleted successfully");
          return handlerInput.responseBuilder
            .speak(requestAttributes.t("deleteDataPrompt"))
            .withShouldEndSession(true)
            .getResponse();
        })
        .catch((error) => {
          console.error(`Error while deleting data: ${error}`);
          return handlerInput.responseBuilder
            .speak(requestAttributes.t("errorDeleteDataPrompt"))
            .withShouldEndSession(true)
            .getResponse();
        });
  },
};

module.exports = {
  SelectMosqueIntentAfterSelectingMosqueHandler,
  SelectMosqueIntentStartedHandler,
  NextPrayerTimeIntentHandler,
  NextIqamaTimeIntentHandler,
  PlayAdhanIntentHandler,
  NextPrayerTimeIntentWithoutNameHandler,
  MosqueInfoIntentHandler,
  AllIqamaTimeIntentHandler,
  DeleteDataIntentHandler,
  AllPrayerTimeIntentHandler
};
