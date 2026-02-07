const i18n = require("i18next");
const sprintf = require("i18next-sprintf-postprocessor");
const languageStrings = require("./languageStrings");
const Alexa = require("ask-sdk-core");
const helperFunctions = require("./helperFunctions.js");
const apiHandler = require("./handlers/apiHandler.js");
const prayerTimeApl = require("./aplDocuments/prayerTimeApl.json");
const { getDataSourceForPrayerTime } = require("./datasources.js");
const awsSsmHandler = require("./handlers/awsSsmHandler.js");

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
  process(handlerInput, response) {
   const timestamp = Alexa.getRequest(handlerInput.requestEnvelope)["timestamp"];
    // console.log("Request Timestamp: ", JSON.stringify(timestamp));
    const requestTimestamp = new Date(timestamp);
    const responseTimestamp = new Date();
    // console.log("Response Timestamp: ", JSON.stringify(responseTimestamp.toISOString()));
    const timeDifference = responseTimestamp - requestTimestamp;
    console.log(`Response Time: ${(timeDifference / 1000).toFixed(2)} seconds`);  },
};

const AddDirectiveResponseInterceptor = {
  async process(handlerInput, response) {   
    if(!response) return;
    const { directives } = response;
    const aplDirective = directives
      ? directives.find(
          (directive) =>
            directive.type === "Alexa.Presentation.APL.RenderDocument" || directive.type === "Alexa.Presentation.APLT.RenderDocument"
        )
      : false;
    // console.log("APL Directive: ", JSON.stringify(aplDirective));      
    const ssmlText = response?.outputSpeech?.ssml || null;
    const text = ssmlText ? ssmlText.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
    const hasAudio = ssmlText ? /<audio\b/i.test(ssmlText) : false;           
    console.log("APL Directive: %s \n SSML Text: %s", JSON.stringify(aplDirective), ssmlText);
    if (ssmlText && !hasAudio) {
      response["outputSpeech"]["ssml"] = helperFunctions.smartEscapeSSML(ssmlText);
    }
    const supportsAPL = Alexa.getSupportedInterfaces(
      handlerInput.requestEnvelope
    );
    if (
      supportsAPL["Alexa.Presentation.APL"] || supportsAPL["Alexa.Presentation.APLT"]
    ) {
      if (!aplDirective) {
        if (ssmlText && !hasAudio && supportsAPL["Alexa.Presentation.APL"]) {
          console.log("Adding APL Directive");
          const dataSource = await getDataSourceForPrayerTime(handlerInput, text);
          // console.log("Data Source: ", JSON.stringify(dataSource));
          const directive = helperFunctions.createDirectivePayload(
            prayerTimeApl,
            dataSource
          );

          if (!directives) {
            response.directives = [directive];
          } else {
            response.directives.push(directive);
          }
        }
      }
    } else {
      console.log("APL not supported");
      if (ssmlText && !hasAudio) {
        console.log("Adding Simple Card");
        response.card = {
          type: "Simple",
          title: process.env.skillName,
          content: text,
        };
      }
    }
  },
};

const LocalizationInterceptor = {
  async process(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    console.log("Request Type: ", requestType);
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
    console.log("SavePersistenceAttributesToSession Interceptor");
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if(shouldSkipProcessing(requestType)){
      return;
    }
    const isNewSession = isPlaybackControllerRequest(requestType)? false : Alexa.isNewSession(handlerInput.requestEnvelope);
    if (isNewSession) {
      console.log("New Session");
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const persistentAttributes = await helperFunctions.getPersistedData(
        handlerInput
      );
      if (persistentAttributes?.uuid) {
        console.log(
          "Persistent Attributes: ",
          JSON.stringify(persistentAttributes)
        );
        delete persistentAttributes.requestedRoutinePrayer;
        handlerInput.attributesManager.setPersistentAttributes(
          persistentAttributes
        );
        await handlerInput.attributesManager.savePersistentAttributes();
        try {
          const mosqueTimes = await apiHandler.getPrayerTimings(
            persistentAttributes.uuid
          );
          sessionAttributes.mosqueTimes = mosqueTimes;
          sessionAttributes.persistentAttributes = persistentAttributes;
          handlerInput.attributesManager.setSessionAttributes(
            sessionAttributes
          );
        } catch (error) {
          console.log("Error while fetching mosque list: ", error);
          if (error?.message === "Mosque not found") {
            await handlerInput.attributesManager.deletePersistentAttributes();
          }
        }
      }
    }
  },
};

const SetApiKeysAsEnvironmentVariableFromAwsSsm = {
  async process(handlerInput) {
    console.log("SetApiKeysAsEnvironmentVariableFromAwsSsm Interceptor");
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if(shouldSkipProcessing(requestType)){
      return;
    }
    const isNewSession = isPlaybackControllerRequest(requestType)? false : Alexa.isNewSession(handlerInput.requestEnvelope);
    if (isNewSession) {
      await awsSsmHandler.handler();
    }        
  },
};

/**
 * Determines whether interceptor processing should be skipped for a given Alexa request type.
 * @param {string} requestType - The request type string from the Alexa request envelope.
 * @returns {boolean} `true` if the request is `AlexaSkillEvent.SkillDisabled` or starts with `AudioPlayer.`, `false` otherwise.
 */
function shouldSkipProcessing(requestType) {
  //skip processing for skill disabled events and audio player requests
  return requestType === "AlexaSkillEvent.SkillDisabled" || requestType.startsWith("AudioPlayer.");
}

/**
 * Determines whether a request type corresponds to a PlaybackController request.
 * @param {string} requestType - The Alexa request type to evaluate.
 * @returns {boolean} `true` if `requestType` starts with `"PlaybackController."`, `false` otherwise.
 */
function isPlaybackControllerRequest(requestType) {
  return requestType.startsWith("PlaybackController.");
}

module.exports = {
  LogResponseInterceptor,
  LogRequestInterceptor,
  LocalizationInterceptor,
  ResponseTimeCalculationInterceptor,
  SavePersistenceAttributesToSession,
  AddDirectiveResponseInterceptor,
  SetApiKeysAsEnvironmentVariableFromAwsSsm
};
