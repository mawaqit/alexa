const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const { getPrayerTimings, getRandomHadith } = require("./apiHandler.js");
const moment = require("moment-timezone");
const {
  getDataSourceforMosqueInfo,
  adhaanRecitation,
  getDataSourceForAdhaanReciter,
  getMetadata,
  getDataSourceForRoutine
} = require("../datasources.js");
const listApl = require("../aplDocuments/mosqueListApl.json");
const { v4: uuidv4 } = require("uuid");
const adhaanTasks = ['amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506.PlayAdhaan'];

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
      if (error?.message === "Mosque not found") {
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
    try {
      const mosqueTimesData = mosqueTimes;
      const prayerNameResolvedId = helperFunctions.getResolvedId(
        handlerInput.requestEnvelope,
        "prayerName"
      );
      console.log("Prayer Name Resolved Id: ", prayerNameResolvedId);
      if(!prayerNameResolvedId){
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("unableToResolvePrayerNamePrompt"))  
          .withShouldEndSession(false)
          .getResponse();
      }
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
            helperFunctions.checkForCharacterDisplay(handlerInput, firstNonNullJumua);
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
            helperFunctions.checkForCharacterDisplay(handlerInput, firstNonNullEid);
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
    } catch (error) {
      console.log("Error in NextPrayerTimeIntentHandler: ", error);
      if( error?.message === "Unable to fetch user timezone") {
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
    try {
      const prayerTimeDetails = helperFunctions.getNextPrayerTime(requestAttributes, mosqueTimes.times, await helperFunctions.getUserTimezone(handlerInput), requestAttributes.t("prayerNames"));
      helperFunctions.checkForCharacterDisplay(handlerInput, prayerTimeDetails.time);
      const speakOutput = requestAttributes.t("nextPrayerWithoutMosquePrompt", prayerTimeDetails.name, prayerTimeDetails.time, prayerTimeDetails.diffInMinutes) + requestAttributes.t("doYouNeedAnythingElsePrompt");
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in NextPrayerTimeIntentWithoutNameHandler: ", error);
      if( error?.message === "Unable to fetch user timezone") {
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
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
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
      mosqueTimes.iqamaCalendar = await getPrayerTimings(
        persistentAttributes.uuid,
        true
      )
        .then((data) => data.iqamaCalendar)
        .catch((error) => {
          console.log("Error in fetching iqama calendar: ", error);
          throw error;
        });
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
      helperFunctions.checkForCharacterDisplay(handlerInput, nextIqamaTime.diffInMinutes);
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
      console.log("Error in fetching next iqama timings: ", error);
      if( error?.message === "Unable to fetch user timezone") {
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
    const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes =
        handlerInput.attributesManager.getRequestAttributes();
    const { persistentAttributes } = sessionAttributes;    
    let audioName = "Adhaan";
    let audioUrl = prayerName === "0" ? adhaanRecitation[0].fajrUrl : adhaanRecitation[0].otherUrl;
    if(persistentAttributes?.favouriteAdhaan){
      const { primaryText } = persistentAttributes.favouriteAdhaan;
      audioName = primaryText;
      audioUrl = prayerName === "0"?  persistentAttributes.favouriteAdhaan.fajrUrl : persistentAttributes.favouriteAdhaan.otherUrl;
    } 
    console.log("Audio URL: ", audioUrl);
    const playBehavior = "REPLACE_ALL";
    const metadataInfo = getMetadata(handlerInput,audioName)
    const supportedInterfaces = Alexa.getSupportedInterfaces(
      handlerInput.requestEnvelope
    );
    if(!supportedInterfaces['AudioPlayer']){
      console.log("Audio Player is not supported on this device");
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("adhaanErrorPrompt"))
        .withShouldEndSession(false)
        .getResponse();
    }
    return handlerInput.responseBuilder
      .withShouldEndSession(true)
      .addAudioPlayerPlayDirective(
        playBehavior,
        audioUrl,
        audioName + "-" + uuidv4(),
        0,
        null,
        metadataInfo
      )
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
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes || !persistentAttributes.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
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
      mosqueTimes.iqamaCalendar = await getPrayerTimings(
        persistentAttributes.uuid,
        true
      )
        .then((data) => data.iqamaCalendar)
        .catch((error) => {
          console.log("Error in fetching iqama calendar: ", error);
          throw error;
        });
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
      if( error?.message === "Unable to fetch user timezone") {
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
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes, mosqueTimes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      return handlerInput.responseBuilder
        .speak(
          (await helperFunctions.getAllPrayerTimesSpeechoutput(
            handlerInput,
            mosqueTimes
          )) + requestAttributes.t("doYouNeedAnythingElsePrompt")
        )
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in fetching Prayer timings: ", error);
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

const FavoriteAdhaanReciterStartedHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "FavoriteAdhaanReciterIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "favouriteReciter")
    );
  },
  async handle(handlerInput) {
    console.log("In FavoriteAdhaanReciterStartedHandler");
    const { responseBuilder, attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    const locale = Alexa.getLocale(handlerInput.requestEnvelope);
    let speechPrompt = "";
    responseBuilder.addDirective({
      type: "Dialog.ElicitSlot",
      slotToElicit: "favouriteReciter",
      updatedIntent: {
        name: "FavoriteAdhaanReciterIntent",
        confirmationStatus: "NONE",
        slots: {
          favouriteReciter: {
            name: "favouriteReciter",
            confirmationStatus: "NONE",
          },
        },
      },
    });
    let adhaanRecitationList = adhaanRecitation;
    try {
      adhaanRecitationList = await Promise.all(
        adhaanRecitation.map(async (adhaan) => {
          const translatedText = await helperFunctions.translateText(
            adhaan.primaryText,
            locale
          );
          return { ...adhaan, primaryText: translatedText };
        })
      );
    } catch (error) {
      console.log("Error in getting adhaan reciter list: ", error);
    }

    console.log("Adhaan Recitation List: ", adhaanRecitationList);
    const adhaanListPrompt = adhaanRecitationList
      .map((adhaan, index) => `${index + 1}. ${adhaan.primaryText}`)
      .join(", ");
    console.log("Adhaan List Prompt: ", adhaanListPrompt);
    speechPrompt += requestAttributes.t("adhanReciterPrompt", adhaanListPrompt);
    if (
      Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
        "Alexa.Presentation.APL"
      ]
    ) {
      try {
        const dataSource = await getDataSourceForAdhaanReciter(
          handlerInput,
          adhaanRecitationList
        );
        console.log("Data Source: ", JSON.stringify(dataSource));
        const aplDirective = helperFunctions.createDirectivePayload(
          listApl,
          dataSource
        );
        console.log("APL Directive: ", JSON.stringify(aplDirective));
        responseBuilder.addDirective(aplDirective);
        speechPrompt += requestAttributes.t("chooseAdhaanByTouchPrompt");
      } catch (error) {
        console.log("Error in creating APL Directive: ", error);
      }
    }

    return responseBuilder
      .speak(speechPrompt)
      .withShouldEndSession(false)
      .getResponse();
  },
};

const FavoriteAdhaanReciterIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "FavoriteAdhaanReciterIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "favouriteReciter")
    );
  },
  async handle(handlerInput) {
    const { responseBuilder, attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    const favouriteReciter = Alexa.getSlotValue(
      handlerInput.requestEnvelope,
      "favouriteReciter"
    );
    console.log("Favourite Reciter: ", favouriteReciter);
    const reciterIndex = parseInt(favouriteReciter) - 1;
    if (Number.isNaN(reciterIndex) || reciterIndex < 0 || reciterIndex >= adhaanRecitation.length) {
      await helperFunctions.callDirectiveService(handlerInput, requestAttributes.t("adhanReciterErrorPrompt"));
      return await FavoriteAdhaanReciterStartedHandler.handle(handlerInput);
    }
    const adhaanReciter = adhaanRecitation[reciterIndex];
    if(!adhaanReciter){
      await helperFunctions.callDirectiveService(handlerInput, requestAttributes.t("adhanReciterErrorPrompt"));
      return await FavoriteAdhaanReciterStartedHandler.handle(handlerInput);
    }
    console.log("Selected Adhaan Reciter: ", adhaanReciter);
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.persistentAttributes.favouriteAdhaan = adhaanReciter;
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes
    );
    const speechOutput = requestAttributes.t("adhanReciterSuccessPrompt", adhaanReciter.primaryText);
    await attributesManager.savePersistentAttributes();
    return responseBuilder
      .speak(speechOutput)
      .withShouldEndSession(false)
      .getResponse();
  },
}

const HadithIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "HadithIntent"
    );
  },
  async handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const locale = helperFunctions.splitLanguage(Alexa.getLocale(handlerInput.requestEnvelope));
    const hadith = await getRandomHadith(locale).catch((error) => {
      console.log("Error in fetching hadith: ", error);
      return requestAttributes.t("hadithErrorPrompt");
    });

    return handlerInput.responseBuilder
      .speak(hadith)
      .withShouldEndSession(false)
      .getResponse();
  },
};

const PlayAdhanTaskHandler = {
  canHandle(handlerInput) {
    const taskName = handlerInput.requestEnvelope.request?.task?.name;
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
        && adhaanTasks.includes(taskName)
    );
  },
  async handle(handlerInput) {
    const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes =
        handlerInput.attributesManager.getRequestAttributes();
    try {
      const { persistentAttributes } = sessionAttributes; 
      if (!persistentAttributes?.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      let { mosqueTimes } = sessionAttributes;
      if (!mosqueTimes?.times) {
        try {
          mosqueTimes = await getPrayerTimings(persistentAttributes.uuid);
          sessionAttributes.mosqueTimes = mosqueTimes;
          handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        } catch (error) {
          console.log("Unable to hydrate mosque times for routine playback: ", error);
          return handlerInput.responseBuilder
            .speak(requestAttributes.t("routineErrorPrompt"))
            .withShouldEndSession(true)
            .getResponse();
        }
      }
      let audioName = "Adhaan";
      const prayerNames = requestAttributes.t("prayerNames");
      const prayerTimeDetails = helperFunctions.getNextPrayerTime(requestAttributes, mosqueTimes.times, await helperFunctions.getUserTimezone(handlerInput), prayerNames);
      const isFajrPrayer = prayerTimeDetails.name === prayerNames[0];
      let audioUrl = isFajrPrayer ? adhaanRecitation[0].fajrUrl : adhaanRecitation[0].otherUrl;
      if(persistentAttributes?.favouriteAdhaan){
        const { primaryText } = persistentAttributes.favouriteAdhaan;
        audioName = primaryText;
        audioUrl = isFajrPrayer ?  persistentAttributes.favouriteAdhaan.fajrUrl : persistentAttributes.favouriteAdhaan.otherUrl;
      } 
      console.log("Audio URL: ", audioUrl);
      const playBehavior = "REPLACE_ALL";
      const metadataInfo = getMetadata(handlerInput,audioName)
      const supportedInterfaces = Alexa.getSupportedInterfaces(
        handlerInput.requestEnvelope
      );
      if(!supportedInterfaces['AudioPlayer']){
        console.log("Audio Player is not supported on this device");
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("adhaanErrorPrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }
      return handlerInput.responseBuilder
        .withShouldEndSession(true)
        .addAudioPlayerPlayDirective(
          playBehavior,
          audioUrl,
          audioName + "-" + uuidv4(),
          0,
          null,
          metadataInfo
        )
        .getResponse();
    } catch (error) {
      console.log("Error in PlayAdhanTaskHandler: ", error);
      if (error?.message === "Unable to fetch user timezone") {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("timezoneErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("errorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const CreateRoutineStartedHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "CreateRoutineIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex") &&
      !helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      const prayerNameDetails =
        await helperFunctions.generatePrayerNameDetailsForRoutine(handlerInput);
      const prayerNameTimePrompt = prayerNameDetails.map(
        (prayer, index) => `${index + 1}. ${prayer.namePhoneme} ${prayer.time}`
      );

      let speechPrompt = requestAttributes.t(
        "prayerNamePrompt",
        prayerNameTimePrompt.join(", ")
      );
      // if (
      //   Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
      //     "Alexa.Presentation.APL"
      //   ]
      // ) {
      //   try {
      //     const routineDataSource = await getDataSourceForRoutine(
      //       handlerInput,
      //       prayerNameDetails
      //     );
      //     console.log("Data Source: ", JSON.stringify(routineDataSource));
      //     const aplDirective = helperFunctions.createDirectivePayload(
      //       listApl,
      //       routineDataSource
      //     );
      //     console.log("APL Directive: ", JSON.stringify(aplDirective));
      //     handlerInput.responseBuilder.addDirective(aplDirective);
      //     speechPrompt += requestAttributes.t("prayerNameTouchPrompt");
      //   } catch (error) {
      //     console.log("Error in creating APL Directive: ", error);
      //   }
      // }
      const currentIntent = handlerInput.requestEnvelope.request.intent;
      return handlerInput.responseBuilder
        .speak(speechPrompt)
        .addElicitSlotDirective("prayerIndex", currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in CreateRoutineStartedHandler: ", error);
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
  },
};

const CreateRoutineIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CreateRoutineIntent" &&
      (Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex") ||
      helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName"))
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {      
      const prayerNameResolvedId = helperFunctions.getResolvedId(
        handlerInput.requestEnvelope,
        "prayerName"
      );
      let prayerIndex =
        parseInt(
          Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex")
        ) || 0;
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return helperFunctions.checkForPersistenceData(handlerInput);
      }
      const prayerNameDetails =
        sessionAttributes.prayerNameDetails ||
        (await helperFunctions.generatePrayerNameDetailsForRoutine(handlerInput));
      const prayerNames = requestAttributes.t("prayerNames");
      if (prayerNameResolvedId !== undefined && prayerNameResolvedId !== null) {
        prayerIndex = parseInt(prayerNameResolvedId) + 1; // Adjusting index to match the slot value
      }
      if (prayerIndex < 1 || prayerIndex > prayerNameDetails.length) {
        console.log("Invalid prayer index: ", prayerIndex);
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t(
              "invalidPrayerIndexPrompt",
              prayerNameDetails.length
            )
          )
          .addDirective({
            type: "Dialog.ElicitSlot",
            slotToElicit: "prayerIndex",
            updatedIntent: {
              name: "CreateRoutineIntent",
              confirmationStatus: "NONE",
              slots: {
                prayerIndex: {
                  name: "prayerIndex",
                  confirmationStatus: "NONE",
                },
                prayerName: {
                  name: "prayerName",
                  confirmationStatus: "NONE",
                },
              },
            },
          })
          .withShouldEndSession(false)
          .getResponse();
      }
      const selectedPrayer = prayerNameDetails[prayerIndex - 1];
      console.log("Selected Prayer: ", selectedPrayer);
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      const automationDirective = helperFunctions.offerAutomation(
        userTimeZone,
        selectedPrayer.time,
        selectedPrayer.name,
        selectedPrayer.namePhoneme === prayerNames[5]
      );
      return handlerInput.responseBuilder
        .addDirective(automationDirective)
        .getResponse();
    } catch (error) {
      console.log("Error in CreateRoutineIntentHandler:", error);
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
  },
};

const SessionResumedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionResumedRequest"
    );
  },
  handle(handlerInput) {
    const status = handlerInput.requestEnvelope.request?.cause?.status;
    const code = parseInt(status.code);
    const message = status.message;
    console.log(
      `SessionResumedRequest received status code : ${code} and message : ${message}`
    );
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    switch (code) {
      case 200:
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t("routineCreatedPrompt") +
              requestAttributes.t("doYouNeedAnythingElsePrompt")
          )
          .withShouldEndSession(false)
          .getResponse();
      case 204: {
        const error =
          handlerInput.requestEnvelope.request?.cause?.result
            ?.offerAutomationResponse?.reason;
        return handlerInput.responseBuilder
          .speak(requestAttributes.t(helperFunctions.generateRoutineErrorMessage(error)))
          .withShouldEndSession(false)
          .getResponse();
      }
      default:
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("routineErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
    }
  },
};



module.exports = {
  SelectMosqueIntentAfterSelectingMosqueHandler,
  SelectMosqueIntentStartedHandler,
  NextPrayerTimeIntentHandler,
  NextIqamaTimeIntentHandler,
  PlayAdhanIntentHandler,
  PlayAdhanTaskHandler,
  NextPrayerTimeIntentWithoutNameHandler,
  MosqueInfoIntentHandler,
  AllIqamaTimeIntentHandler,
  DeleteDataIntentHandler,
  AllPrayerTimeIntentHandler,
  FavoriteAdhaanReciterStartedHandler,
  FavoriteAdhaanReciterIntentHandler,
  HadithIntentHandler,
  CreateRoutineStartedHandler,
  CreateRoutineIntentHandler,
  SessionResumedRequestHandler
};