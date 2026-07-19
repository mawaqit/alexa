const Alexa = require("ask-sdk-core");
const helperFunctions = require("../helperFunctions.js");
const { getPrayerTimings, getRandomHadith } = require("./apiHandler.js");
const moment = require("moment-timezone");
const {
  getDataSourceforMosqueInfo,
  adhaanRecitation,
  getDataSourceForAdhaanReciter,
  getMetadata,
  getDataSourceForRoutine,
  getDataSourceForDeleteRoutineList,
} = require("../datasources.js");
const listApl = require("../aplDocuments/mosqueListApl.json");
const { randomUUID: uuidv4 } = require("crypto");
const adhaanTasks = [
  "amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506.PlayAdhaan",
];
const { DeleteUserInfo } = require("./dynamoDbHandler.js");
const ALL_PRAYER_INDEX = 8;

const DeleteRoutineStartedHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "DeleteRoutineIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex") &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerName") &&
      !helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const requestEnvelope = handlerInput.requestEnvelope;
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const responseBuilder = handlerInput.responseBuilder;
    const { persistentAttributes } = sessionAttributes;
    try {
      if (!persistentAttributes?.uuid) {
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      const routinePrayers = persistentAttributes.routinePrayers || [];
      if (routinePrayers.length === 0) {
        return responseBuilder
          .speak(requestAttributes.t("noRoutinesPrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }

      let routineList = routinePrayers
        .map(({ name, time, namePhoneme }) => ({
          primaryText: `${name}`,
          name,
          time,
          namePhoneme: namePhoneme || name,
        }))
        .sort((a, b) => {
          const timeA = moment(a.time, "HH:mm");
          const timeB = moment(b.time, "HH:mm");
          return timeA.diff(timeB);
        });
      if (routineList.length === 1) {
        const routineName = routineList[0].name;
        const deleted = await helperFunctions.deleteRoutine(
          handlerInput,
          routineName,
        );
        let speakOutput = requestAttributes.t("routineDeletedPrompt");
        if (deleted) {
          return responseBuilder
            .speak(
              speakOutput + requestAttributes.t("doYouNeedAnythingElsePrompt"),
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        return responseBuilder
          .speak(requestAttributes.t("deleteRoutineErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
      }
      routineList = [helperFunctions.ALL_PRAYERS(handlerInput), ...routineList];
      let speakOutput = requestAttributes.t(
        "deleteRoutinePrompt",
        routineList
          .map((r, index) => `${index + 1}. ${r.namePhoneme}`)
          .join(", "),
      );
      // Create APL if supported
      if (
        Alexa.getSupportedInterfaces(requestEnvelope)["Alexa.Presentation.APL"]
      ) {
        try {
          const dataSource = await getDataSourceForDeleteRoutineList(
            handlerInput,
            routineList,
          );
          const aplDirective = helperFunctions.createDirectivePayload(
            listApl,
            dataSource,
          );
          responseBuilder.addDirective(aplDirective);
          speakOutput += requestAttributes.t("deleteRoutineTouchPrompt");
        } catch (error) {
          console.log("Error creating APL for Delete Routine: ", error);
        }
      }

      const currentIntent = handlerInput.requestEnvelope.request.intent;
      return responseBuilder
        .speak(speakOutput)
        .addElicitSlotDirective("prayerIndex", currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in DeleteRoutineStartedHandler: ", error);
      if (error?.message === "Unable to fetch user timezone") {
        return responseBuilder
          .speak(requestAttributes.t("timezoneErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
      }
      return responseBuilder
        .speak(requestAttributes.t("deleteRoutineErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const DeleteRoutinePrayerIndexHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "DeleteRoutineIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex") &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerName") &&
      !helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const requestEnvelope = handlerInput.requestEnvelope;
    const responseBuilder = handlerInput.responseBuilder;
    try {
      const prayerIndex =
        parseInt(Alexa.getSlotValue(requestEnvelope, "prayerIndex")) || 0;
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }

      let routinePrayers = persistentAttributes.routinePrayers || [];
      if (routinePrayers.length != 0) {
        routinePrayers = [
          helperFunctions.ALL_PRAYERS(handlerInput),
          ...routinePrayers,
        ];
      }
      if (prayerIndex < 1 || prayerIndex > routinePrayers.length) {
        console.log("Invalid prayer index: ", prayerIndex);
        sessionAttributes.skipAplDirective = true;
        sessionAttributes.skipCardDirective = true;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t(
              "invalidPrayerIndexPrompt",
              routinePrayers.length,
            ),
          )
          .addDirective({
            type: "Dialog.ElicitSlot",
            slotToElicit: "prayerIndex",
            updatedIntent: {
              name: "DeleteRoutineIntent",
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
      // Slot is present, delete directly
      const selectedPrayer = routinePrayers[prayerIndex - 1];
      console.log("Selected Prayer: ", selectedPrayer);
      const routineName = selectedPrayer.name; // or resolved name
      const deleted = await helperFunctions.deleteRoutine(
        handlerInput,
        routineName,
      );
      let speakOutput = requestAttributes.t("routineDeletedPrompt");
      if (routineName === requestAttributes.t("allPrayers")) {
        speakOutput = requestAttributes.t("routinesDeletedPrompt");
      }
      if (deleted) {
        return responseBuilder
          .speak(
            speakOutput + requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      }
      return responseBuilder
        .speak(requestAttributes.t("deleteRoutineErrorPrompt")) // Reuse error or "routine not found"
        .withShouldEndSession(true)
        .getResponse();
    } catch (error) {
      console.log("Error in DeleteRoutinePrayerIndexHandler:", error);
      if (error?.message === "Unable to fetch user timezone") {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("timezoneErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("deleteRoutineErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

const DeleteRoutinePrayerNameHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "DeleteRoutineIntent" &&
      !Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex") &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const requestEnvelope = handlerInput.requestEnvelope;
    const responseBuilder = handlerInput.responseBuilder;
    try {
      const prayerResolvedName = helperFunctions.getResolvedValue(
        requestEnvelope,
        "prayerName",
      );
      const prayerNameResolvedId = helperFunctions.getResolvedId(
        requestEnvelope,
        "prayerName",
      );
      console.log("Prayer Name: ", prayerResolvedName);
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      const routinePrayers = persistentAttributes.routinePrayers || [];
      const prayerIndex = routinePrayers.findIndex(
        (prayer) => prayer.name === prayerResolvedName,
      );
      if (
        prayerIndex === -1 &&
        prayerNameResolvedId !== String(ALL_PRAYER_INDEX)
      ) {
        console.log("Invalid prayer name: ", prayerResolvedName);
        sessionAttributes.skipAplDirective = true;
        sessionAttributes.skipCardDirective = true;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("unableToResolvePrayerNamePrompt"))
          .addDirective({
            type: "Dialog.ElicitSlot",
            slotToElicit: "prayerName",
            updatedIntent: {
              name: "DeleteRoutineIntent",
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
      // Slot is present, delete directly
      const selectedPrayer =
        prayerNameResolvedId === String(ALL_PRAYER_INDEX)
          ? helperFunctions.ALL_PRAYERS(handlerInput)
          : routinePrayers[prayerIndex];
      console.log("Selected Prayer: ", selectedPrayer);
      const routineName = selectedPrayer.name; // or resolved name
      const deleted = await helperFunctions.deleteRoutine(
        handlerInput,
        routineName,
      );
      let speakOutput = requestAttributes.t("routineDeletedPrompt");
      if (routineName === requestAttributes.t("allPrayers")) {
        speakOutput = requestAttributes.t("routinesDeletedPrompt");
      }

      if (deleted) {
        return responseBuilder
          .speak(
            speakOutput + requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      }
      return responseBuilder
        .speak(requestAttributes.t("deleteRoutineErrorPrompt")) // Reuse error or "routine not found"
        .withShouldEndSession(true)
        .getResponse();
    } catch (error) {
      console.log("Error in DeleteRoutinePrayerNameHandler:", error);
      if (error?.message === "Unable to fetch user timezone") {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("timezoneErrorPrompt"))
          .withShouldEndSession(true)
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(requestAttributes.t("deleteRoutineErrorPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

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
    return await helperFunctions.getListOfMosqueBasedOnCity(
      handlerInput,
      requestAttributes.t("okPrompt"),
    );
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
      "selectedMosque",
    );
    console.log("Selected Mosque: ", selectedMosque);
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const mosqueList = sessionAttributes.mosqueList;
    // Alexa routes SelectMosqueIntent on the utterance alone, so a bare "two"
    // can arrive without the list ever having been read out, and a recycled
    // session drops it. Indexing undefined here throws before the try block
    // below, surfacing as the global error prompt. Re-offer the list instead.
    // (MosqueYesIntentHandler guards the same thing.)
    if (!Array.isArray(mosqueList) || mosqueList.length === 0) {
      console.log("SelectMosqueIntent without a mosque list in session.");
      return await helperFunctions.getListOfMosque(
        handlerInput,
        requestAttributes.t("unableToFindMosquePrompt"),
      );
    }
    const selectedMosqueDetails = mosqueList[parseInt(selectedMosque) - 1];
    if (!selectedMosqueDetails) {
      return await helperFunctions.createResponseDirectiveForMosqueList(
        handlerInput,
        mosqueList,
        requestAttributes.t("unableToFindMosquePrompt"),
      );
    }
    selectedMosqueDetails.primaryText = await helperFunctions.translateText(
      selectedMosqueDetails.primaryText,
      locale,
    );
    selectedMosqueDetails.localisation = await helperFunctions.translateText(
      selectedMosqueDetails.localisation,
      locale,
    );
    // Keep the raw distance in meters; it is localized at display time.
    selectedMosqueDetails.proximity = parseInt(selectedMosqueDetails.proximity);
    console.log("Selected Mosque Details: ", selectedMosqueDetails);
    sessionAttributes.persistentAttributes = selectedMosqueDetails;
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes,
    );
    await handlerInput.attributesManager.savePersistentAttributes();
    try {
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      const mosqueTimes = await getPrayerTimings(
        selectedMosqueDetails.uuid,
        userTimeZone,
      );
      sessionAttributes.mosqueTimes = mosqueTimes;
      await helperFunctions.updateRoutinePrayers(handlerInput);
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return await helperFunctions.getPrayerTimingsForMosque(
        handlerInput,
        mosqueTimes,
        requestAttributes.t(
          "selectedMosquePrompt",
          selectedMosqueDetails.primaryText,
        ),
      );
    } catch (error) {
      console.log("Error in fetching prayer timings: ", error);
      if (error?.message === "Mosque not found") {
        return await helperFunctions.getListOfMosque(
          handlerInput,
          requestAttributes.t("mosqueNotRegisteredPrompt"),
        );
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
      "prayerName",
    );
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {
      const mosqueTimesData = mosqueTimes;
      const prayerNameResolvedId = helperFunctions.getResolvedId(
        handlerInput.requestEnvelope,
        "prayerName",
      );
      console.log("Prayer Name Resolved Id: ", prayerNameResolvedId);
      if (!prayerNameResolvedId) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("unableToResolvePrayerNamePrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }
      const prayerNameFromData =
        requestAttributes.t("prayerNames")[parseInt(prayerNameResolvedId)];
      console.log("Prayer Name: ", prayerName);
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone }),
      );
      const now = moment(currentDateTime);
      const currentMoment = moment(now.format("YYYY-MM-DDTHH:mm"));
      const locale = Alexa.getLocale(handlerInput.requestEnvelope);
      console.log("Now: ", JSON.stringify(now));
      console.log("Prayer Name From Data: ", prayerNameFromData);
      if (parseInt(prayerNameResolvedId) < 5) {
        const prayerIndex = parseInt(prayerNameResolvedId);
        let timeForNextPrayer = mosqueTimesData.times[prayerIndex];
        // When today's prayer has already passed, the next occurrence is
        // tomorrow — and tomorrow's actual time can differ from today's, so we
        // fetch it from the calendar instead of reusing today's time.
        if (helperFunctions.hasPrayerTimePassed(timeForNextPrayer, now)) {
          try {
            const tomorrowTimes = await helperFunctions.getTomorrowPrayerTimes(
              persistentAttributes.uuid,
              userTimeZone,
            );
            if (tomorrowTimes?.times?.[prayerIndex]) {
              timeForNextPrayer = tomorrowTimes.times[prayerIndex];
            }
          } catch (error) {
            console.log("Error fetching tomorrow's prayer times: ", error);
          }
        }
        return helperFunctions.getPrayerTimeForSpecificPrayer(
          handlerInput,
          timeForNextPrayer,
          currentMoment,
          now,
          prayerNameFromData,
          userTimeZone,
        );
      }
      switch (parseInt(prayerNameResolvedId)) {
        case 5: {
          // Extract only the Jumu'ah times
          const jumuaTimes = [
            mosqueTimesData.jumua,
            mosqueTimesData.jumua2,
            mosqueTimesData.jumua3,
          ];
          // Find the first non-null Jumu'ah time
          const firstNonNullJumua = jumuaTimes
            .filter((time) => time !== null && time !== undefined)
            .map((time) => helperFunctions.formatTime(time, locale))
            .join(", ");
          if (firstNonNullJumua) {
            helperFunctions.checkForCharacterDisplay(
              handlerInput,
              firstNonNullJumua,
            );
            return handlerInput.responseBuilder
              .speak(
                requestAttributes.t(
                  "nextPrayerTimeSpecificPrompt",
                  primaryText,
                  prayerNameFromData,
                  firstNonNullJumua,
                ),
              )
              .withShouldEndSession(false)
              .getResponse();
          }
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t("noPrayerTimePrompt", prayerNameFromData) +
                requestAttributes.t("doYouNeedAnythingElsePrompt"),
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        case 6: {
          // Extract only the Eid times
          const eidTimes = [
            mosqueTimesData.aidPrayerTime,
            mosqueTimesData.aidPrayerTime2,
          ];
          // Find the first non-null Eid time
          const firstNonNullEid = eidTimes
            .filter((time) => time !== null && time !== undefined)
            .map((time) => helperFunctions.formatTime(time, locale))
            .join(", ");
          if (firstNonNullEid) {
            helperFunctions.checkForCharacterDisplay(
              handlerInput,
              firstNonNullEid,
            );
            return handlerInput.responseBuilder
              .speak(
                requestAttributes.t(
                  "nextPrayerTimeSpecificPrompt",
                  primaryText,
                  prayerNameFromData,
                  firstNonNullEid,
                ),
              )
              .withShouldEndSession(false)
              .getResponse();
          }
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t("noPrayerTimePrompt", prayerNameFromData) +
                requestAttributes.t("doYouNeedAnythingElsePrompt"),
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        case 7: {
          let firstNonNullShuruq = mosqueTimesData.shuruq;
          if (firstNonNullShuruq) {
            // Shuruq for today has passed → use tomorrow's shuruq time.
            if (helperFunctions.hasPrayerTimePassed(firstNonNullShuruq, now)) {
              try {
                const tomorrowTimes =
                  await helperFunctions.getTomorrowPrayerTimes(
                    persistentAttributes.uuid,
                    userTimeZone,
                  );
                if (tomorrowTimes?.shuruq) {
                  firstNonNullShuruq = tomorrowTimes.shuruq;
                }
              } catch (error) {
                console.log("Error fetching tomorrow's prayer times: ", error);
              }
            }
            return helperFunctions.getPrayerTimeForSpecificPrayer(
              handlerInput,
              firstNonNullShuruq,
              currentMoment,
              now,
              prayerNameFromData,
              userTimeZone,
            );
          }
          return handlerInput.responseBuilder
            .speak(
              requestAttributes.t("noPrayerTimePrompt", prayerNameFromData) +
                requestAttributes.t("doYouNeedAnythingElsePrompt"),
            )
            .withShouldEndSession(false)
            .getResponse();
        }
        default:
          return handlerInput.responseBuilder
            .speak(requestAttributes.t("unableToResolvePrayerNamePrompt"))
            .withShouldEndSession(false)
            .getResponse();
      }
    } catch (error) {
      console.log("Error in NextPrayerTimeIntentHandler: ", error);
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
      const prayerTimeDetails = await helperFunctions.getNextPrayerTime(
        requestAttributes,
        mosqueTimes.times,
        await helperFunctions.getUserTimezone(handlerInput),
        requestAttributes.t("prayerNames"),
        [],
        persistentAttributes.uuid,
      );
      helperFunctions.checkForCharacterDisplay(
        handlerInput,
        prayerTimeDetails.time,
      );
      const locale = Alexa.getLocale(handlerInput.requestEnvelope);
      const speakOutput =
        requestAttributes.t(
          "nextPrayerWithoutMosquePrompt",
          prayerTimeDetails.name,
          helperFunctions.formatTime(prayerTimeDetails.time, locale),
          prayerTimeDetails.diffInMinutesPrompt,
        ) + requestAttributes.t("doYouNeedAnythingElsePrompt");
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in NextPrayerTimeIntentWithoutNameHandler: ", error);
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
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      console.log("User Timezone: ", userTimeZone);
      const prayerNames = requestAttributes.t("prayerNames");
      const { iqamaEnabled } = mosqueTimes;
      if (!iqamaEnabled) {
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t("iqamaNotEnabledPrompt") +
              requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      }
      mosqueTimes.iqamaCalendar = await getPrayerTimings(
        persistentAttributes.uuid,
        userTimeZone,
        true,
      )
        .then((data) => data.iqamaCalendar)
        .catch((error) => {
          console.log("Error in fetching iqama calendar: ", error);
          throw error;
        });
      const iqamaCalendar = mosqueTimes.iqamaCalendar;
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone }),
      );
      const date = currentDateTime.getDate();
      const month = currentDateTime.getMonth();
      const iqamaTimes = iqamaCalendar?.[month]?.[String(date)];
      console.log("Iqama Times: ", iqamaTimes);
      // Without today's row, getNextPrayerTime falls back to its `iqamaTime = []`
      // default and resolves every slot to the adhan itself — which would be
      // announced to the user as the iqama. Saying we don't have the times is
      // correct; sending someone to the mosque at the call to prayer is not.
      if (!Array.isArray(iqamaTimes)) {
        console.log(
          "No iqama row for today; refusing to fall back to adhan times.",
        );
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t("iqamaNotEnabledPrompt") +
              requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      }
      const nextIqamaTime = await helperFunctions.getNextPrayerTime(
        requestAttributes,
        mosqueTimes.times,
        userTimeZone,
        prayerNames,
        iqamaTimes,
        persistentAttributes.uuid,
      );
      console.log("Next Iqama Time: ", nextIqamaTime);
      helperFunctions.checkForCharacterDisplay(
        handlerInput,
        nextIqamaTime.diffInMinutesPrompt,
      );
      return handlerInput.responseBuilder
        .speak(
          requestAttributes.t(
            "nextIqamaTimePrompt",
            nextIqamaTime.name,
            nextIqamaTime.diffInMinutesPrompt,
          ) + requestAttributes.t("doYouNeedAnythingElsePrompt"),
        )
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in fetching next iqama timings: ", error);
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

const PlayAdhanIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "PlayAdhanIntent"
    );
  },
  async handle(handlerInput) {
    const prayerName = helperFunctions.getResolvedId(
      handlerInput.requestEnvelope,
      "prayerName",
    );
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const { persistentAttributes } = sessionAttributes;
    let audioName = "Adhaan";
    let audioUrl =
      prayerName === "0"
        ? adhaanRecitation[0].fajrUrl
        : adhaanRecitation[0].otherUrl;
    if (persistentAttributes?.favouriteAdhaan) {
      const { primaryText } = persistentAttributes.favouriteAdhaan;
      audioName = primaryText;
      audioUrl =
        prayerName === "0"
          ? persistentAttributes.favouriteAdhaan.fajrUrl
          : persistentAttributes.favouriteAdhaan.otherUrl;
    }
    console.log("Audio URL: ", audioUrl);
    const playBehavior = "REPLACE_ALL";
    const metadataInfo = getMetadata(handlerInput, audioName);
    const supportedInterfaces = Alexa.getSupportedInterfaces(
      handlerInput.requestEnvelope,
    );
    if (!supportedInterfaces["AudioPlayer"]) {
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
        metadataInfo,
      )
      .getResponse();
  },
};

const MosqueInfoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "MosqueInfoIntent"
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
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      const {
        primaryText,
        localisation,
        proximity,
        jumua,
        jumua2,
        jumua3,
        image,
      } = persistentAttributes;
      const mosqueInfo = {
        mosqueName: primaryText,
        mosqueDescription: localisation,
        mosqueImage: image,
      };
      const locale = Alexa.getLocale(handlerInput.requestEnvelope);
      const distanceUnits =
        await helperFunctions.getUserDistanceUnits(handlerInput);
      // Extract only the Jumu'ah times
      const jumuaTimes = [jumua, jumua2, jumua3];
      const prayerNames = requestAttributes.t("prayerNames");
      let prayerTimeApl = prayerNames.slice(0, 5).map((prayer, index) => {
        const prayerTime = mosqueTimes.times[index];
        return {
          primaryText: `${prayer} ${helperFunctions.formatTime(prayerTime, locale)}`,
        };
      });
      let speakOutput = requestAttributes.t(
        "mosqueInfoPrompt",
        primaryText,
        localisation,
        helperFunctions.formatDistance(proximity, locale, distanceUnits),
      );
      // Find the first non-null Jumu'ah time
      const firstNonNullJumua = jumuaTimes.filter(
        (time) => time !== null && time !== undefined,
      );
      if (firstNonNullJumua.length > 0) {
        speakOutput += requestAttributes.t(
          "jummaTimePrompt",
          firstNonNullJumua
            .map((jumuaTime) => helperFunctions.formatTime(jumuaTime, locale))
            .join(", "),
        );
        firstNonNullJumua.forEach((jumuaTime, index) => {
          prayerTimeApl.push({
            primaryText: `${prayerNames[5]} ${index + 1} ${helperFunctions.formatTime(jumuaTime, locale)}`,
          });
        });
      } else {
        speakOutput += requestAttributes.t("noJumuaTime");
        prayerTimeApl.push({
          primaryText: `${prayerNames[5]}  ${requestAttributes.t("none")}`,
        });
      }
      if (mosqueTimes.shuruq) {
        prayerTimeApl.push({
          primaryText: `${prayerNames[7]}  ${helperFunctions.formatTime(mosqueTimes.shuruq, locale)}`,
        });
      }
      if (
        Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
          "Alexa.Presentation.APL"
        ]
      ) {
        const dataSource = await getDataSourceforMosqueInfo(
          handlerInput,
          prayerTimeApl,
          mosqueInfo,
        );
        console.log("Data Source: ", JSON.stringify(dataSource));
        const aplDirective = helperFunctions.createDirectivePayload(
          require("../aplDocuments/mosqueInfoApl.json"),
          dataSource,
        );
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
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AllIqamaIntent"
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
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      console.log("User Timezone: ", userTimeZone);
      const prayerNames = requestAttributes.t("prayerNames");
      const { iqamaEnabled } = mosqueTimes;
      if (!iqamaEnabled) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("iqamaNotEnabledPrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }
      mosqueTimes.iqamaCalendar = await getPrayerTimings(
        persistentAttributes.uuid,
        userTimeZone,
        true,
      )
        .then((data) => data.iqamaCalendar)
        .catch((error) => {
          console.log("Error in fetching iqama calendar: ", error);
          throw error;
        });
      const iqamaCalendar = mosqueTimes.iqamaCalendar;
      const currentDateTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: userTimeZone }),
      );
      const date = currentDateTime.getDate();
      const month = currentDateTime.getMonth();
      const iqamaTimes = iqamaCalendar?.[month]?.[String(date)];
      console.log("Iqama Times: ", iqamaTimes);
      // Without today's row, getNextPrayerTime falls back to its `iqamaTime = []`
      // default and resolves every slot to the adhan itself — which would be
      // announced to the user as the iqama. Saying we don't have the times is
      // correct; sending someone to the mosque at the call to prayer is not.
      if (!Array.isArray(iqamaTimes)) {
        console.log(
          "No iqama row for today; refusing to fall back to adhan times.",
        );
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t("iqamaNotEnabledPrompt") +
              requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      }
      const locale = Alexa.getLocale(handlerInput.requestEnvelope);
      let allIqamaTimes = "";
      prayerNames.forEach((prayer, index) => {
        const iqamaTime = iqamaTimes[index];
        const prayerTime = mosqueTimes.times[index];
        if (prayerTime && iqamaTime) {
          const iqamaDetails = helperFunctions.generateNextPrayerTime(
            requestAttributes,
            prayerTime,
            moment(currentDateTime),
            prayer,
            iqamaTime,
            userTimeZone,
          );
          console.log("Iqama Details for %s: ", prayer, iqamaDetails);
          allIqamaTimes += requestAttributes.t(
            "allIqamaTimesPrompt",
            prayer,
            helperFunctions.formatTime(
              iqamaDetails.time.format("HH:mm"),
              locale,
            ),
          );
        }
      });

      return handlerInput.responseBuilder
        .speak(
          allIqamaTimes + requestAttributes.t("doYouNeedAnythingElsePrompt"),
        )
        .withShouldEndSession(false)
        .getResponse();
    } catch (error) {
      console.log("Error in fetching iqama timings: ", error);
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
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      return handlerInput.responseBuilder
        .speak(
          (await helperFunctions.getAllPrayerTimesSpeechoutput(
            handlerInput,
            mosqueTimes,
          )) + requestAttributes.t("doYouNeedAnythingElsePrompt"),
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
      Alexa.getIntentName(handlerInput.requestEnvelope) === "DeleteDataIntent"
    );
  },
  async handle(handlerInput) {
    const { requestEnvelope, responseBuilder, attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    const intent = requestEnvelope.request.intent;
    const confirmationStatus = intent ? intent.confirmationStatus : "NONE";

    if (confirmationStatus === "DENIED") {
      return responseBuilder
        .speak(requestAttributes.t("deleteDataDeniedPrompt") + requestAttributes.t("doYouNeedAnythingElsePrompt"))
        .withShouldEndSession(false)
        .getResponse();
    }

    if (confirmationStatus !== "CONFIRMED") {
      const confirmPrompt = requestAttributes.t("deleteDataConfirmPrompt");
      return responseBuilder
        .speak(confirmPrompt)
        .reprompt(confirmPrompt)
        .addConfirmIntentDirective()
        .getResponse();
    }

    const userId = Alexa.getUserId(requestEnvelope);
    console.log(`Skill was disabled for user: ${userId}`);
    try {
      await DeleteUserInfo(userId);
      await attributesManager.deletePersistentAttributes();
      return responseBuilder
        .speak(requestAttributes.t("deleteDataPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    } catch (error) {
      console.error(`Error while deleting data: ${error}`);
      return responseBuilder
        .speak(requestAttributes.t("errorDeleteDataPrompt"))
        .withShouldEndSession(true)
        .getResponse();
    }
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
            locale,
          );
          return { ...adhaan, primaryText: translatedText };
        }),
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
          adhaanRecitationList,
        );
        console.log("Data Source: ", JSON.stringify(dataSource));
        const aplDirective = helperFunctions.createDirectivePayload(
          listApl,
          dataSource,
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
      "favouriteReciter",
    );
    console.log("Favourite Reciter: ", favouriteReciter);
    const reciterIndex = parseInt(favouriteReciter) - 1;
    if (
      Number.isNaN(reciterIndex) ||
      reciterIndex < 0 ||
      reciterIndex >= adhaanRecitation.length
    ) {
      await helperFunctions.callDirectiveService(
        handlerInput,
        requestAttributes.t("adhanReciterErrorPrompt"),
      );
      return await FavoriteAdhaanReciterStartedHandler.handle(handlerInput);
    }
    const adhaanReciter = adhaanRecitation[reciterIndex];
    if (!adhaanReciter) {
      await helperFunctions.callDirectiveService(
        handlerInput,
        requestAttributes.t("adhanReciterErrorPrompt"),
      );
      return await FavoriteAdhaanReciterStartedHandler.handle(handlerInput);
    }
    console.log("Selected Adhaan Reciter: ", adhaanReciter);
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.persistentAttributes.favouriteAdhaan = adhaanReciter;
    handlerInput.attributesManager.setPersistentAttributes(
      sessionAttributes.persistentAttributes,
    );
    const speechOutput = requestAttributes.t(
      "adhanReciterSuccessPrompt",
      adhaanReciter.primaryText,
    );
    await attributesManager.savePersistentAttributes();
    return responseBuilder
      .speak(speechOutput)
      .withShouldEndSession(false)
      .getResponse();
  },
};

const HadithIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "HadithIntent"
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const locale = helperFunctions.splitLanguage(
      Alexa.getLocale(handlerInput.requestEnvelope),
    );
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
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest" &&
      adhaanTasks.includes(taskName)
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
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      let { mosqueTimes } = sessionAttributes;

      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      if (!mosqueTimes?.times) {
        try {
          mosqueTimes = await getPrayerTimings(
            persistentAttributes.uuid,
            userTimeZone,
          );
          sessionAttributes.mosqueTimes = mosqueTimes;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes,
          );
        } catch (error) {
          console.log(
            "Unable to hydrate mosque times for routine playback: ",
            error,
          );
          return handlerInput.responseBuilder
            .speak(requestAttributes.t("routineErrorPrompt"))
            .withShouldEndSession(true)
            .getResponse();
        }
      }
      let audioName = "Adhaan";
      const prayerNames = requestAttributes.t("prayerNames");
      const prayerTimeDetails = await helperFunctions.getNextPrayerTime(
        requestAttributes,
        mosqueTimes.times,
        userTimeZone,
        prayerNames,
        [],
        persistentAttributes.uuid,
      );
      const isFajrPrayer = prayerTimeDetails.name === prayerNames[0];
      let audioUrl = isFajrPrayer
        ? adhaanRecitation[0].fajrUrl
        : adhaanRecitation[0].otherUrl;
      if (persistentAttributes?.favouriteAdhaan) {
        const { primaryText } = persistentAttributes.favouriteAdhaan;
        audioName = primaryText;
        audioUrl = isFajrPrayer
          ? persistentAttributes.favouriteAdhaan.fajrUrl
          : persistentAttributes.favouriteAdhaan.otherUrl;
      }
      console.log("Audio URL: ", audioUrl);
      const playBehavior = "REPLACE_ALL";
      const metadataInfo = getMetadata(handlerInput, audioName);
      const supportedInterfaces = Alexa.getSupportedInterfaces(
        handlerInput.requestEnvelope,
      );
      if (!supportedInterfaces["AudioPlayer"]) {
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
          metadataInfo,
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
    const validateUserAccountStatus =
      await helperFunctions.validateUserAccountStatus(handlerInput);
    if (validateUserAccountStatus) {
      return validateUserAccountStatus;
    }
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      let prayerNameDetails =
        await helperFunctions.generatePrayerNameDetailsForRoutine(handlerInput);
      if (prayerNameDetails.length === 0) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("allRoutinesEnabled"))
          .withShouldEndSession(false)
          .getResponse();
      }
      const prayerNameChoices = prayerNameDetails.map(
        (prayer, index) => `${index + 1}. ${prayer.namePhoneme}`,
      );

      let speechPrompt = requestAttributes.t(
        "prayerNamePrompt",
        prayerNameChoices.join(", "),
      );
      if (
        Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
          "Alexa.Presentation.APL"
        ]
      ) {
        try {
          const routineDataSource = await getDataSourceForRoutine(
            handlerInput,
            prayerNameDetails,
          );
          console.log("Data Source: ", JSON.stringify(routineDataSource));
          const aplDirective = helperFunctions.createDirectivePayload(
            listApl,
            routineDataSource,
          );
          console.log("APL Directive: ", JSON.stringify(aplDirective));
          handlerInput.responseBuilder.addDirective(aplDirective);
          speechPrompt += requestAttributes.t("prayerNameTouchPrompt");
        } catch (error) {
          console.log("Error in creating APL Directive: ", error);
        }
      }
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

const CreateRoutinePrayerIndexHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "CreateRoutineIntent" &&
      Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex") &&
      !helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const validateUserAccountStatus =
      await helperFunctions.validateUserAccountStatus(handlerInput);
    if (validateUserAccountStatus) return validateUserAccountStatus;
    try {
      let prayerIndex =
        parseInt(
          Alexa.getSlotValue(handlerInput.requestEnvelope, "prayerIndex"),
        ) || 0;
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      let prayerNameDetails =
        sessionAttributes.prayerNameDetails ||
        (await helperFunctions.generatePrayerNameDetailsForRoutine(
          handlerInput,
        ));
      if (prayerNameDetails.length === 0) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("allRoutinesEnabled"))
          .withShouldEndSession(false)
          .getResponse();
      }
      if (
        (prayerIndex < 1 || prayerIndex > prayerNameDetails.length) &&
        prayerIndex !== ALL_PRAYER_INDEX + 1
      ) {
        console.log("Invalid prayer index: ", prayerIndex);
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t(
              "invalidPrayerIndexPrompt",
              prayerNameDetails.length,
            ),
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
      let selectedPrayer = {};
      if (prayerIndex === ALL_PRAYER_INDEX + 1 || prayerIndex === 1) {
        selectedPrayer = prayerNameDetails[0];
      } else {
        prayerNameDetails = prayerNameDetails.filter(
          (prayer) => prayer.name !== requestAttributes.t("allPrayers"),
        );
        selectedPrayer = prayerNameDetails[prayerIndex - 2];
      }

      console.log("Selected Prayer: ", selectedPrayer);
      return await helperFunctions.logRoutineCreation(
        handlerInput,
        selectedPrayer,
        prayerNameDetails,
      );
    } catch (error) {
      console.log("Error in CreateRoutinePrayerIndexHandler:", error);
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

const CreateRoutinePrayerNameHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "CreateRoutineIntent" &&
      helperFunctions.getResolvedId(handlerInput.requestEnvelope, "prayerName")
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const validateUserAccountStatus =
      await helperFunctions.validateUserAccountStatus(handlerInput);
    if (validateUserAccountStatus) return validateUserAccountStatus;
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const { persistentAttributes } = sessionAttributes;
      if (!persistentAttributes?.uuid) {
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      let prayerNameDetails =
        sessionAttributes.prayerNameDetails ||
        (await helperFunctions.generatePrayerNameDetailsForRoutine(
          handlerInput,
        ));
      if (prayerNameDetails.length === 0) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("allRoutinesEnabled"))
          .withShouldEndSession(false)
          .getResponse();
      }

      const prayerNameResolvedId = helperFunctions.getResolvedId(
        handlerInput.requestEnvelope,
        "prayerName",
      );

      let selectedPrayer;
      if (prayerNameResolvedId === String(ALL_PRAYER_INDEX)) {
        const allPrayersName = requestAttributes.t("allPrayers");
        selectedPrayer = prayerNameDetails.find(
          (prayer) => prayer.name === allPrayersName,
        );
      } else {
        const canonicalName =
          helperFunctions.CANONICAL_PRAYER_NAMES[
            parseInt(prayerNameResolvedId)
          ];
        selectedPrayer = prayerNameDetails.find(
          (prayer) => prayer.canonicalName === canonicalName,
        );
      }

      if (!selectedPrayer) {
        console.log(
          "Selected prayer not found or already enabled for resolved ID: ",
          prayerNameResolvedId,
        );
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("routineAlreadyEnabled"))
          .withShouldEndSession(false)
          .getResponse();
      }

      console.log("Selected Prayer: ", selectedPrayer);
      return await helperFunctions.logRoutineCreation(
        handlerInput,
        selectedPrayer,
        prayerNameDetails,
      );
    } catch (error) {
      console.log("Error in CreateRoutinePrayerNameHandler:", error);
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
  async handle(handlerInput) {
    const status = handlerInput.requestEnvelope.request?.cause?.status;
    const code = parseInt(status.code);
    const message = status.message;
    console.log(
      `SessionResumedRequest received status code : ${code} and message : ${message}`,
    );
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();

    const prayerNameDetails =
      helperFunctions.getRequestedRoutinePrayer(handlerInput);
    await helperFunctions.deleteRequestedRoutinePrayer(handlerInput);
    switch (code) {
      case 200:
        if (prayerNameDetails) {
          const response = await helperFunctions.logRoutineCreation(
            handlerInput,
            prayerNameDetails,
          );
          if (response) {
            return response;
          }
        }
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t("routineCreatedPrompt") +
              requestAttributes.t("doYouNeedAnythingElsePrompt"),
          )
          .withShouldEndSession(false)
          .getResponse();
      case 204: {
        const error =
          handlerInput.requestEnvelope.request?.cause?.result
            ?.offerAutomationResponse?.reason;
        if (error === "AUTOMATION_ALREADY_ENABLED" && prayerNameDetails) {
          await helperFunctions.logRoutineCreation(
            handlerInput,
            prayerNameDetails,
          );
        }
        return handlerInput.responseBuilder
          .speak(
            requestAttributes.t(
              helperFunctions.generateRoutineErrorMessage(error),
            ),
          )
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

const YesIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.YesIntent"
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
        return await helperFunctions.checkForPersistenceData(handlerInput);
      }
      const prayerNameDetails =
        helperFunctions.getRequestedRoutinePrayer(handlerInput);
      if (
        !prayerNameDetails ||
        !prayerNameDetails.time ||
        !prayerNameDetails.name
      ) {
        return handlerInput.responseBuilder
          .speak(requestAttributes.t("helpPrompt"))
          .withShouldEndSession(false)
          .getResponse();
      }
      // const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      // const automationDirective = helperFunctions.offerAutomation(
      //   userTimeZone,
      //   prayerNameDetails.time,
      //   prayerNameDetails.name,
      //   prayerNameDetails.namePhoneme === requestAttributes.t("prayerNames")[5],
      // );
      // return handlerInput.responseBuilder
      //   .addDirective(automationDirective)
      //   .getResponse();
      return await helperFunctions.logRoutineCreation(
        handlerInput,
        prayerNameDetails,
      );
    } catch (error) {
      console.log("Error in YesIntentHandler:", error);
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

const NoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.NoIntent"
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    await helperFunctions.deleteRequestedRoutinePrayer(handlerInput);
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("stopPrompt"))
      .withShouldEndSession(false)
      .getResponse();
  },
};

const MosqueYesIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.YesIntent" &&
      handlerInput.attributesManager.getSessionAttributes().isMosqueRequested
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    try {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const mosqueList = sessionAttributes.mosqueList;
      const locale = Alexa.getLocale(handlerInput.requestEnvelope);
      if (!mosqueList || mosqueList.length === 0) {
        throw new Error("Mosque not found");
      }
      const selectedMosqueDetails = mosqueList[0];
      delete sessionAttributes.mosqueList;
      delete sessionAttributes.isMosqueRequested;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      if (!selectedMosqueDetails) {
        return await helperFunctions.createResponseDirectiveForMosqueList(
          handlerInput,
          mosqueList,
          requestAttributes.t("unableToFindMosquePrompt"),
        );
      }
      selectedMosqueDetails.primaryText = await helperFunctions.translateText(
        selectedMosqueDetails.primaryText,
        locale,
      );
      selectedMosqueDetails.localisation = await helperFunctions.translateText(
        selectedMosqueDetails.localisation,
        locale,
      );
      // Keep the raw distance in meters; it is localized at display time.
      selectedMosqueDetails.proximity = parseInt(
        selectedMosqueDetails.proximity,
      );
      console.log("Selected Mosque Details: ", selectedMosqueDetails);
      sessionAttributes.persistentAttributes = selectedMosqueDetails;
      handlerInput.attributesManager.setPersistentAttributes(
        sessionAttributes.persistentAttributes,
      );
      await handlerInput.attributesManager.savePersistentAttributes();
      const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
      const mosqueTimes = await getPrayerTimings(
        selectedMosqueDetails.uuid,
        userTimeZone,
      );
      sessionAttributes.mosqueTimes = mosqueTimes;
      await helperFunctions.updateRoutinePrayers(handlerInput);
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return await helperFunctions.getPrayerTimingsForMosque(
        handlerInput,
        mosqueTimes,
        requestAttributes.t(
          "selectedMosquePrompt",
          selectedMosqueDetails.primaryText,
        ),
      );
    } catch (error) {
      console.log("Error in MosqueYesIntentHandler: ", error);
      if (error?.message === "Mosque not found") {
        return await helperFunctions.getListOfMosque(
          handlerInput,
          requestAttributes.t("mosqueNotRegisteredPrompt"),
        );
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
  },
};

const MosqueNoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.NoIntent" &&
      handlerInput.attributesManager.getSessionAttributes().isMosqueRequested
    );
  },
  async handle(handlerInput) {
    const requestAttributes =
      handlerInput.attributesManager.getRequestAttributes();
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes();
    delete sessionAttributes.mosqueList;
    delete sessionAttributes.isMosqueRequested;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("stopPrompt"))
      .withShouldEndSession(false)
      .getResponse();
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
  CreateRoutinePrayerIndexHandler,
  CreateRoutinePrayerNameHandler,
  SessionResumedRequestHandler,
  YesIntentHandler,
  NoIntentHandler,
  DeleteRoutineStartedHandler,
  DeleteRoutinePrayerIndexHandler,
  DeleteRoutinePrayerNameHandler,
  MosqueYesIntentHandler,
  MosqueNoIntentHandler,
};
