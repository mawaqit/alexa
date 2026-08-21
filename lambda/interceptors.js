const i18n = require("i18next");
const sprintf = require("i18next-sprintf-postprocessor");
const languageStrings = require("./languageStrings");
const Alexa = require("ask-sdk-core");
const helperFunctions = require("./helperFunctions.js");
const apiHandler = require("./handlers/apiHandler.js");
const prayerTimeApl = require("./aplDocuments/prayerTimeApl.json");
const { getDataSourceForPrayerTime } = require("./datasources.js");
const awsSsmHandler = require("./handlers/awsSsmHandler.js");
const authHandler = require("./handlers/authHandler.js");
const webConfigHandler = require("./handlers/webConfigHandler.js");

const LogRequestInterceptor = {
  process(handlerInput) {
    // Log Request
    console.log("==== REQUEST ======");
    console.log(JSON.stringify(handlerInput.requestEnvelope, null, 2));
  },
};
/**
 * Response Interceptor to log the response made to Alexa
 */
const LogResponseInterceptor = {
  process(handlerInput, response) {
    // Log Response
    console.log("==== RESPONSE ======");
    console.log(JSON.stringify(response, null, 2));
  },
};

const ResponseTimeCalculationInterceptor = {
  process(handlerInput, _response) {
    const timestamp = Alexa.getRequest(handlerInput.requestEnvelope)[
      "timestamp"
    ];
    // console.log("Request Timestamp: ", JSON.stringify(timestamp));
    const requestTimestamp = new Date(timestamp);
    const responseTimestamp = new Date();
    // console.log("Response Timestamp: ", JSON.stringify(responseTimestamp.toISOString()));
    const timeDifference = responseTimestamp - requestTimestamp;
    console.log(`Response Time: ${(timeDifference / 1000).toFixed(2)} seconds`);
  },
};

const AddDirectiveResponseInterceptor = {
  async process(handlerInput, response) {
    const sessionAttributes = handlerInput.requestEnvelope?.session
      ? handlerInput.attributesManager.getSessionAttributes()
      : {};
    const { skipAplDirective, skipCardDirective } = sessionAttributes;
    if (!response) {
      return;
    }

    const { directives } = response;
    const aplDirective = getAplDirective(directives);
    const { ssmlText, text, hasAudio } = getSsmlInfo(response);

    // Redundant with LogResponseInterceptor, which already dumps the full
    // response (including directives and outputSpeech).
    // console.log(
    //   "APL Directive: %s \n SSML Text: %s",
    //   JSON.stringify(aplDirective),
    //   ssmlText,
    // );

    if (ssmlText && !hasAudio) {
      response["outputSpeech"]["ssml"] =
        helperFunctions.smartEscapeSSML(ssmlText);
    }

    const supportsAPL = Alexa.getSupportedInterfaces(
      handlerInput.requestEnvelope,
    );

    if (
      !skipAplDirective &&
      (supportsAPL["Alexa.Presentation.APL"] ||
        supportsAPL["Alexa.Presentation.APLT"])
    ) {
      await handleAplSupport(
        handlerInput,
        response,
        aplDirective,
        ssmlText,
        hasAudio,
        text,
        supportsAPL,
      );
    } else {
      handleNoAplSupport(response, ssmlText, hasAudio, text, skipCardDirective);
    }
    if (
      handlerInput.requestEnvelope?.session &&
      (sessionAttributes?.skipAplDirective ||
        sessionAttributes?.skipCardDirective)
    ) {
      delete sessionAttributes.skipAplDirective;
      delete sessionAttributes.skipCardDirective;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    }
  },
};

function getAplDirective(directives) {
  return directives
    ? directives.find(
        (directive) =>
          directive?.type &&
          directive.type.startsWith("Alexa.Presentation.APL"),
      ) || false
    : false;
}

function getSsmlInfo(response) {
  const ssmlText = response?.outputSpeech?.ssml || null;
  const text = ssmlText ? ssmlText.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
  const hasAudio = ssmlText ? /<audio\b/i.test(ssmlText) : false;
  return { ssmlText, text, hasAudio };
}

async function handleAplSupport(
  handlerInput,
  response,
  aplDirective,
  ssmlText,
  hasAudio,
  text,
  supportsAPL,
) {
  if (
    !aplDirective &&
    ssmlText &&
    !hasAudio &&
    supportsAPL["Alexa.Presentation.APL"]
  ) {
    const dataSource = await getDataSourceForPrayerTime(handlerInput, text);
    const directive = helperFunctions.createDirectivePayload(
      prayerTimeApl,
      dataSource,
    );

    if (!response.directives) {
      response.directives = [directive];
    } else {
      response.directives.push(directive);
    }
  }
}

function handleNoAplSupport(
  response,
  ssmlText,
  hasAudio,
  text,
  skipCardDirective,
) {
  if (ssmlText && !hasAudio && !skipCardDirective) {
    response.card = {
      type: "Simple",
      title: process.env.skillName,
      content: text,
    };
  }
}

const LocalizationInterceptor = {
  async process(handlerInput) {
    // Request type is redundant with LogRequestInterceptor, which already
    // dumps the full request envelope (including request.type).
    let locale = Alexa.getLocale(handlerInput.requestEnvelope);
    // Gets the locale from the request and initializes i18next.
    const localizationClient = i18n.use(sprintf).init({
      lng: locale,
      resources: languageStrings,
      returnObjects: true,
    });
    // Creates a localize function to support arguments.
    localizationClient.localize = function localize() {
      // gets arguments through and passes them to
      // i18next using sprintf to replace string placeholders
      // with arguments.
      const args = arguments;
      let values = [];

      for (let i = 1; i < args.length; i++) {
        values.push(args[i]);
      }
      const value = i18n.t(args[0], {
        returnObjects: true,
        postProcess: "sprintf",
        sprintf: values,
      });
      return value;
    };
    // this gets the request attributes and save the localize function inside
    // it to be used in a handler by calling requestAttributes.t(STRING_ID, [args...])
    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function translate(...args) {
      return localizationClient.localize(...args);
    };
  },
};

const SavePersistenceAttributesToSession = {
  async process(handlerInput) {
    if (helperFunctions.isNewSession(handlerInput)) {
      await handleNewSession(handlerInput);
    }
  },
};

async function handleNewSession(handlerInput) {
  const persistentAttributes =
    await helperFunctions.getPersistedData(handlerInput);

  if (persistentAttributes?.uuid) {
    await processPersistentAttributes(handlerInput, persistentAttributes);
  } else {
    // No mosque selected via voice yet — but the user may have configured
    // one from the companion website before ever opening the skill (or
    // before finishing account linking). If so, apply it now instead of
    // falling through to the usual "please select a mosque" prompt.
    await tryHydrateFromWebConfig(handlerInput);
  }
}

/**
 * Web-first hydration: applies a mosque/prayer selection staged from the
 * companion website (see webConfigHandler.applyPendingWebConfig) on the
 * user's first Alexa launch after account linking. Alexa-first users get
 * this applied immediately when they save from the website instead — this
 * is only the fallback for the other order.
 */
async function tryHydrateFromWebConfig(handlerInput) {
  try {
    const userInfo = await GetUserInfo.process(handlerInput);
    if (!userInfo?.user_id) {
      return; // not account-linked yet — the existing "please link your account" prompt is untouched
    }

    // Already inside a live Alexa request, so the Alexa id is known
    // directly — same lookup CustomDynamoDbPersistenceAdapter's default
    // partitionKeyGenerator uses. Passed through so applyPendingWebConfig
    // can skip the userId-index GSI, which can't find a brand-new user's
    // row yet (see the comment on that function).
    const alexaId =
      handlerInput.requestEnvelope?.session?.user?.userId ||
      handlerInput.requestEnvelope?.context?.System?.user?.userId;
    if (!alexaId) {
      return;
    }

    const result = await webConfigHandler.applyPendingWebConfig(
      userInfo.user_id,
      {
        alexaId,
      },
    );
    if (!result.applied) {
      return; // nothing staged from the website, or not enough staged yet to apply (e.g. no mosque)
    }

    // applyPendingWebConfig wrote straight to DynamoDB via its own adapter
    // instance, bypassing this request's attributesManager cache — push its
    // result in directly rather than re-reading through
    // attributesManager.getPersistentAttributes(), which would hand back
    // the stale pre-write value it already cached earlier in this request.
    handlerInput.attributesManager.setPersistentAttributes(result.attributes);
    await processPersistentAttributes(handlerInput, result.attributes);
  } catch (error) {
    console.error("Error while hydrating from web config: ", error);
  }
}

async function processPersistentAttributes(handlerInput, persistentAttributes) {
  delete persistentAttributes.requestedRoutinePrayer;
  try {
    const userInfo = await GetUserInfo.process(handlerInput);
    if (userInfo && userInfo?.user_id && !persistentAttributes?.user_id) {
      persistentAttributes.user_id = userInfo?.user_id;
      handlerInput.attributesManager.setPersistentAttributes(
        persistentAttributes,
      );
      await handlerInput.attributesManager.savePersistentAttributes();
    }
  } catch (error) {
    console.error("Error while fetching user info: ", error);
  }

  const sessionAttributes =
    handlerInput.attributesManager.getSessionAttributes();

  try {
    const userTimeZone = await helperFunctions.getUserTimezone(handlerInput);
    const mosqueTimes = await apiHandler.getPrayerTimings(
      persistentAttributes.uuid,
      userTimeZone,
    );
    sessionAttributes.mosqueTimes = mosqueTimes;
    const { routinePrayers } = persistentAttributes;
    updateRoutinePrayerTimings(
      routinePrayers,
      mosqueTimes.times,
      persistentAttributes,
    );
    sessionAttributes.persistentAttributes = persistentAttributes;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  } catch (error) {
    console.error("Error while fetching mosque list: ", error);
    if (error?.message === "Mosque not found") {
      await handlerInput.attributesManager.deletePersistentAttributes();
    } else if (error?.message === "Unable to fetch user timezone") {
      // Timezone unavailable: still load persistentAttributes into session so
      // handlers can display the correct mosque context and prompt for timezone consent.
      sessionAttributes.persistentAttributes = persistentAttributes;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    }
  }
}

const SetApiKeysAsEnvironmentVariableFromAwsSsm = {
  async process(_handlerInput) {
    await awsSsmHandler.handler();
  },
};

const GetUserInfo = {
  async process(handlerInput) {
    const accessToken =
      handlerInput.requestEnvelope?.session?.user?.accessToken;
    if (!accessToken) {
      return;
    }
    const userInfo = await authHandler.getUserInfo(accessToken);
    return userInfo;
  },
};

function updateRoutinePrayerTimings(
  routinePrayers,
  mosqueTimes,
  persistentAttributes,
) {
  if (
    routinePrayers &&
    Array.isArray(routinePrayers) &&
    routinePrayers.length > 0
  ) {
    const updatedPrayers = routinePrayers.map((prayer) => {
      // 1. Find the index in the canonical list
      const canonicalIndex = helperFunctions.CANONICAL_PRAYER_NAMES.findIndex(
        (prayerName) =>
          prayerName?.toLowerCase() === prayer?.canonicalName?.toLowerCase() ||
          prayerName?.toLowerCase() === prayer?.name?.toLowerCase(),
      );
      // 2. Logic to get the new time from your mosque data
      // Assuming 'mosqueTimes' is an object where keys match canonical names
      const newTime = mosqueTimes[canonicalIndex];
      // 3. Return the updated object
      return {
        ...prayer,
        canonicalName:
          helperFunctions.CANONICAL_PRAYER_NAMES[canonicalIndex] ||
          prayer.canonicalName,
        primaryText: `${prayer.name} ${newTime || prayer.time}`,
        time: newTime || prayer.time, // fallback to old time if mosque time is missing
      };
    });
    persistentAttributes.routinePrayers = updatedPrayers;
  }
}

module.exports = {
  LogResponseInterceptor,
  LogRequestInterceptor,
  LocalizationInterceptor,
  ResponseTimeCalculationInterceptor,
  SavePersistenceAttributesToSession,
  AddDirectiveResponseInterceptor,
  SetApiKeysAsEnvironmentVariableFromAwsSsm,
};
