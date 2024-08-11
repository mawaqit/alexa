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

const AddDirectiveResponseInterceptor = {
  process(handlerInput, response) {
    
    const { directives } = response;
    const aplDirective = directives
      ? directives.find(
          (directive) =>
            directive.type === "Alexa.Presentation.APL.RenderDocument"
        )
      : false;
    console.log("APL Directive: ", JSON.stringify(aplDirective));      
    const ssmlText = response.outputSpeech.ssml;      
    console.log("SSML Text: ", ssmlText);
    if (
      Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)[
        "Alexa.Presentation.APL"
      ]
    ) {
      if (!aplDirective) {
        if (ssmlText && !ssmlText.includes("audio src=")) {
          console.log("Adding APL Directive");
          const text = ssmlText.replace(/<\/?[^>]+(>|$)/g, "")
          const dataSource = getDataSourceForPrayerTime(handlerInput, text);
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
      if (ssmlText && !ssmlText.includes("audio src=")) {
        console.log("Adding APL Directive");
        const text = ssmlText.replace(/<\/?[^>]+(>|$)/g, "");
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
  process(handlerInput) {
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

      for (var i = 1; i < args.length; i++) {
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
    const isNewSession = Alexa.isNewSession(handlerInput.requestEnvelope);
    if (isNewSession) {
      console.log("New Session");
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes();
      const persistentAttributes = await helperFunctions.getPersistedData(
        handlerInput
      );
      if (persistentAttributes && persistentAttributes.uuid) {
        console.log(
          "Persistent Attributes: ",
          JSON.stringify(persistentAttributes)
        );
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
          if (error === "Mosque not found") {
            await handlerInput.attributesManager.deletePersistentAttributes();
          }
        }
      }
    }
  },
};

const SetApiKeysAsEnvironmentVaraibleFromAwsSsm = {
  async process(handlerInput) {
    const isNewSession = Alexa.isNewSession(handlerInput.requestEnvelope);
    if (isNewSession)
      await awsSsmHandler.handler();
  },
};

module.exports = {
  LogResponseInterceptor,
  LogRequestInterceptor,
  LocalizationInterceptor,
  SavePersistenceAttributesToSession,
  AddDirectiveResponseInterceptor,
  SetApiKeysAsEnvironmentVaraibleFromAwsSsm
};
