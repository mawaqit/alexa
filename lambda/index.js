const Alexa = require("ask-sdk-core");
const moment = require("moment-timezone");
const axios = require("axios");
const AWS = require("aws-sdk");
const ddbAdapter = require("ask-sdk-dynamodb-persistence-adapter");
const {
  LocalizationInterceptor,
  LogRequestInterceptor,
  LogResponseInterceptor,
} = require("./interceptors.js");
const helperFunctions = require('./helperFunctions.js');
const { SkillEventHandler } = require("./handlers/skillEventHandler.js");
const apiKey = "Bearer 66ecf547-ee3d-4bf2-bcc9-65b52f76ae9d";

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  async handle(handlerInput) {
    await helperFunctions.getPersistedData(handlerInput);    
    const { requestEnvelope, serviceClientFactory, responseBuilder, attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    const isGeolocationSupported = Alexa.getSupportedInterfaces(requestEnvelope)['Geolocation'];
    if ( isGeolocationSupported ) {
      const geoObject = requestEnvelope.context.Geolocation;
      if (!geoObject || !geoObject.coordinate) {
        return responseBuilder
          .speak(requestAttributes.t('requestForGeoLocationPrompt'))
          .withAskForPermissionsConsentCard([
            "alexa::devices:all:geolocation:read",
          ])
          .getResponse();
      } else {
        // use location data
        console.log('Location data: ', JSON.stringify(geoObject));
      }
    } else if (!helperFunctions.checkForConsentTokenToAccessDeviceLocation(handlerInput)) {
      return responseBuilder
        .speak(requestAttributes.t('requestForGeoLocationPrompt'))
        .withAskForPermissionsConsentCard(['read::alexa:device:all:address'])
        .getResponse();
    } 
    
    try {
      const deviceId = Alexa.getDeviceId(requestEnvelope);
      const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
      const address = await deviceAddressServiceClient.getFullAddress(deviceId);

      console.log('Address successfully retrieved, now responding to user : ', address);

      if (address.stateOrRegion === null || address.city === null) {
        return responseBuilder
          .speak(requestAttributes.t('noAddressPrompt'))
          .getResponse();
      } 
    } catch (error) {
      console.log('Error in retrieving address: ', error);
      if (error.name !== 'ServiceError') {
        return responseBuilder
          .speak('Uh Oh. Looks like something went wrong.')
          .withShouldEndSession(true)
          .getResponse();
      }
    }
    const speakOutput = requestAttributes.t('welcomePrompt');

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .withSimpleCard("MAWAQIT", speakOutput)
      .getResponse();
  },
};

const PrayerTimeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "PrayerTimeIntent"
    );
  },
  async handle(handlerInput) {
    let speakOutput =
      "Unable to fetch your next Prayer Timings. Please try agin later";
    const prayerTimings = await getPrayerTimings();
    if (!prayerTimings) {
      return (
        handlerInput.responseBuilder
          .speak(speakOutput)
          .withSimpleCard("Prayer Time", speakOutput)
          //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
          .getResponse()
      );
    }
    const serviceClientFactory = handlerInput.serviceClientFactory;
    const deviceId =
      handlerInput.requestEnvelope.context.System.device.deviceId;
    let userTimeZone = "America/Los_Angeles";
    try {
      const upsServiceClient = serviceClientFactory.getUpsServiceClient();
      userTimeZone = await upsServiceClient.getSystemTimeZone(deviceId);
    } catch (error) {
      console.log("Error while fetching Prayer Timings: ", error.message);
    }
    console.log("Timezone: ", userTimeZone);
    console.log("Prayer Timings: ", prayerTimings);
    const nextPrayerTime = getNextPrayerTime(prayerTimings, userTimeZone);
    speakOutput = "Your next Prayer Time is " + nextPrayerTime;
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withSimpleCard("Prayer Time", speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const MosqueDetailIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "MosqueDetailIntent"
    );
  },
  async handle(handlerInput) {
    const mosqueName = await getMosqueName();
    let speakOutput = "Unable to fetch mosque details. Please try agin later";
    if (!mosqueName) {
      return (
        handlerInput.responseBuilder
          .speak(speakOutput)
          .withSimpleCard("Mosque Details", speakOutput)
          //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
          .getResponse()
      );
    }
    speakOutput = "Your mosque name is " + mosqueName;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withSimpleCard("Mosque Details", speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const speakOutput = "You can say hello to me! How can I help?";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    const speakOutput = "Goodbye!";

    return handlerInput.responseBuilder
    .speak(speakOutput)
    .withShouldEndSession(true)
    .getResponse();
  },
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput) {
    const speakOutput = "Sorry, I don't know about that. Please try again.";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    console.log(
      `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`
    );
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  },
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `You just triggered ${intentName}`;

    return (
      handlerInput.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const speakOutput =
      "Sorry, I had trouble doing what you asked. Please try again.";
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};

//Helper functions
const getMosqueName = async () => {
  let config = {
    method: "get",
    url: "https://mawaqit.net/api/3.0/mosque/0ff4259c-540a-445e-ad4c-8131299f14a9/info",
    headers: {
      accept: "application/json",
      Authorization: apiKey,
    },
  };

  let response = await axios
    .request(config)
    .then((response) => {
      if (!response || !response.data || !response.data.name) {
        throw "Received Empty Response";
      }
      console.log("Mosque Details: ", JSON.stringify(response.data));

      return response.data.name;
    })
    .catch((error) => {
      console.log("Error while fetching mosque Details: ", error);
      return null;
    });
  return response;
};

const getPrayerTimings = async () => {
  let config = {
    method: "get",
    url: "https://mawaqit.net/api/3.0/mosque/0ff4259c-540a-445e-ad4c-8131299f14a9/times",
    headers: {
      accept: "application/json",
      Authorization: apiKey,
    },
  };

  let response = await axios
    .request(config)
    .then((response) => {
      if (!response || !response.data || !response.data.times) {
        throw "Received Empty Response";
      }
      console.log("Mosque Timings: ", JSON.stringify(response.data));

      return response.data.times;
    })
    .catch((error) => {
      console.log("Error while fetching mosque Timings: ", error);
      return null;
    });
  return response;
};

const getNextPrayerTime = (times, timezone) => {
  const currentDateTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone })
  );
  // Get the current moment object with time zone information
  const now = moment(currentDateTime);
  console.log("Now: ", JSON.stringify(now));

  // Parse times into moment objects (assuming times are in your current time zone)
  const timeMoments = times.map((time) => {
    const [hours, minutes] = time.split(":");
    return moment(`${now.format("YYYY-MM-DD")}T${hours}:${minutes}`);
  });
  console.log("Time Moments: ", timeMoments);
  // Find the first time greater than or equal to current time (considering time zone)
  const nextTime = timeMoments.find((time) => time.isSameOrAfter(now));
  console.log("Next Time: ", nextTime);
  if (nextTime) {
    console.log(
      "The first time greater than or equal to current time is:",
      nextTime.format("HH:mm")
    );
    return nextTime.format("HH:mm");
  } else {
    console.log("No time is greater than or equal to current time: ", times[0]);
    return times[0];
  }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    PrayerTimeIntentHandler,
    MosqueDetailIntentHandler,
    HelpIntentHandler,
    SkillEventHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler
  )
  .addRequestInterceptors(LogRequestInterceptor, LocalizationInterceptor)
  .addResponseInterceptors(LogResponseInterceptor)
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(
    new ddbAdapter.DynamoDbPersistenceAdapter({
      tableName: process.env.persistenceAdapterTableName,
      createTable: true,
      dynamoDBClient: new AWS.DynamoDB({
        apiVersion: "latest",
        region: process.env.awsRegion,
      }),
    })
  )
  .withCustomUserAgent("sample/hello-world/v1.2")
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
